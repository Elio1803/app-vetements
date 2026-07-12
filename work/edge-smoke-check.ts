import { HttpError, readJsonBody } from "../supabase/functions/_shared/http.ts";

(globalThis as typeof globalThis & {
  Deno: { env: { get(name: string): string | undefined } };
}).Deno = {
  env: {
    get: (name) => name === "ALLOWED_ORIGINS" ? "http://localhost:5173" : undefined,
  },
};

const [analyze, generate] = await Promise.all([
  import("../supabase/functions/analyze-clothing/index.ts"),
  import("../supabase/functions/generate-outfits/index.ts"),
]);

for (const handler of [analyze.default.fetch, generate.default.fetch]) {
  const preflight = await handler(new Request("http://edge.local", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5173" },
  }));
  if (
    preflight.status !== 204 ||
    preflight.headers.get("access-control-allow-origin") !== "http://localhost:5173"
  ) throw new Error("CORS preflight failed");
}

const parsed = await readJsonBody(new Request("http://edge.local", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ok: true }),
}));
if (!(parsed as { ok?: boolean }).ok) throw new Error("JSON body parsing failed");

const oversized = new Request("http://edge.local", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(33 * 1024));
      controller.close();
    },
  }),
  duplex: "half",
} as RequestInit & { duplex: "half" });
try {
  await readJsonBody(oversized);
  throw new Error("Oversized streamed body was accepted");
} catch (error) {
  if (!(error instanceof HttpError) || error.status !== 413) throw error;
}

console.log("Edge imports, CORS, JSON parsing, and streamed body limit: ok");
