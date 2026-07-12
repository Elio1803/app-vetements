const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const MAX_JSON_BODY_BYTES = 32 * 1024;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function configuredOrigins(): Set<string> | "*" {
  const value = Deno.env.get("ALLOWED_ORIGINS")?.trim();
  if (!value) return LOCAL_ORIGINS;
  if (value === "*") return "*";

  return new Set(
    value.split(",").map((origin) => origin.trim()).filter(Boolean),
  );
}

export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowed = configuredOrigins();
  return allowed === "*" || allowed.has(origin);
}

function responseHeaders(request: Request): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = request.headers.get("origin");
  const allowed = configuredOrigins();

  if (origin && (allowed === "*" || allowed.has(origin))) {
    headers.set("Access-Control-Allow-Origin", allowed === "*" ? "*" : origin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

export function jsonResponse(
  request: Request,
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}

export function guardRequest(request: Request): Response | null {
  if (!isOriginAllowed(request)) {
    return jsonResponse(request, 403, {
      error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." },
    });
  }

  if (request.method === "OPTIONS") {
    const headers = responseHeaders(request);
    headers.delete("Content-Type");
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, x-client-info, apikey, content-type",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    const response = jsonResponse(request, 405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." },
    });
    response.headers.set("Allow", "POST, OPTIONS");
    return response;
  }

  return null;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
    );
  }

  const advertisedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(request, error.status, {
      error: { code: error.code, message: error.message },
    });
  }

  console.error(
    "Unhandled Edge Function error:",
    error instanceof Error ? error.message : "unknown error",
  );
  return jsonResponse(request, 500, {
    error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
  });
}
