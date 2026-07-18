import { HttpError } from "./http.ts";
import type { EncodedImage } from "./images.ts";

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
    type: "image";
    source: {
      type: "base64";
      media_type: EncodedImage["mediaType"];
      data: string;
    };
  };

interface AnthropicJsonRequest<T> {
  system: string;
  content: AnthropicContentBlock[];
  maxTokens: number;
  validate: (value: unknown) => T;
  /** Overrides the ANTHROPIC_MODEL secret, e.g. for a cheaper model on lightweight calls. */
  model?: string;
}

interface MessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
}

function modelJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const objectStart = withoutFence.indexOf("{");
    const objectEnd = withoutFence.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(withoutFence.slice(objectStart, objectEnd + 1)) as unknown;
    }
    throw new Error("model response does not contain a JSON object");
  }
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new HttpError(
      500,
      "AI_CONFIGURATION_ERROR",
      "AI service is not configured.",
    );
  }
  return value;
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
}

export function imageBlock(image: EncodedImage): AnthropicContentBlock {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mediaType,
      data: image.data,
    },
  };
}

export async function callAnthropicJson<T>(
  options: AnthropicJsonRequest<T>,
): Promise<T> {
  const apiKey = requiredSecret("ANTHROPIC_API_KEY");
  const model = options.model?.trim() || requiredSecret("ANTHROPIC_MODEL");
  let lastFailure: unknown;

  // At most two API calls: the single retry required by the product spec.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryReminder: AnthropicContentBlock[] = attempt === 0
      ? []
      : [{
        type: "text",
        text:
          "Nouvel essai : respecte exactement le schéma demandé et renvoie uniquement un objet JSON valide, sans balise markdown.",
      }];

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens,
          temperature: 0,
          system: options.system,
          messages: [{
            role: "user",
            content: [...options.content, ...retryReminder],
          }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      lastFailure = error;
      if (attempt === 0) {
        await waitBeforeRetry(attempt);
        continue;
      }
      throw new HttpError(504, "AI_TIMEOUT", "AI service did not respond in time.");
    }

    if (!response.ok) {
      lastFailure = new Error(`Anthropic HTTP ${response.status}`);
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await response.body?.cancel();
        await waitBeforeRetry(attempt);
        continue;
      }

      await response.body?.cancel();
      throw new HttpError(
        response.status === 429 ? 503 : 502,
        "AI_UPSTREAM_ERROR",
        "AI service is temporarily unavailable.",
      );
    }

    try {
      const payload = await response.json() as MessagesResponse;
      const text = payload.content
        ?.filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n") ?? "";
      return options.validate(modelJson(text));
    } catch (error) {
      lastFailure = error;
      if (attempt === 0) {
        await waitBeforeRetry(attempt);
        continue;
      }
    }
  }

  console.error(
    "Anthropic returned invalid JSON twice:",
    lastFailure instanceof Error ? lastFailure.message : "validation failed",
  );
  throw new HttpError(
    502,
    "AI_INVALID_RESPONSE",
    "AI service returned an invalid response.",
  );
}
