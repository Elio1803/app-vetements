import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticatedContext } from "../_shared/auth.ts";
import {
  errorResponse,
  guardRequest,
  HttpError,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import {
  isClothingCategory,
  isRecord,
  type ClothingCategory,
} from "../_shared/domain.ts";
import {
  assertOwnedObjectPath,
  downloadEncodedImage,
} from "../_shared/images.ts";

interface ClothingRow {
  id: string;
  photo_url: string;
  category: ClothingCategory;
  name: string | null;
}

interface FalQueuedResponse {
  request_id?: string;
  status_url?: string;
  response_url?: string;
}

const MAX_ITEM_COUNT = 5;
const MAX_PROVIDER_WAIT_MS = 70_000;
const PROVIDER_POLL_INTERVAL_MS = 1_400;
const DEFAULT_MODEL = "fal-ai/fashn/tryon";

function requiredFalKey(): string {
  const value = Deno.env.get("FAL_API_KEY")?.trim();
  if (!value) {
    throw new HttpError(
      501,
      "TRYON_PROVIDER_NOT_CONFIGURED",
      "Configure FAL_API_KEY to enable outfit visual generation.",
    );
  }
  return value;
}

function mannequinReferenceUrl(): string {
  const value = Deno.env.get("TRYON_MODEL_IMAGE_URL")?.trim();
  if (!value || !/^https?:\/\//i.test(value)) {
    throw new HttpError(
      501,
      "TRYON_MANNEQUIN_NOT_CONFIGURED",
      "Configure TRYON_MODEL_IMAGE_URL with a neutral mannequin image.",
    );
  }
  return value;
}

function falModelEndpoint(): string {
  const model = Deno.env.get("FAL_TRYON_MODEL")?.trim() || DEFAULT_MODEL;
  const base = (Deno.env.get("FAL_API_BASE")?.trim() || "https://fal.run").replace(/\/$/, "");
  return `${base}/${model.replace(/^\/+/, "")}`;
}

function itemIdsFromBody(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.itemIds)) {
    throw new HttpError(400, "INVALID_REQUEST", "itemIds must be an array.");
  }
  const ids = body.itemIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (ids.length === 0 || ids.length > MAX_ITEM_COUNT) {
    throw new HttpError(
      400,
      "INVALID_ITEM_COUNT",
      `Select between 1 and ${MAX_ITEM_COUNT} items.`,
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new HttpError(400, "DUPLICATE_ITEMS", "itemIds must be unique.");
  }
  return ids;
}

async function loadOwnedItems(
  client: SupabaseClient,
  itemIds: string[],
): Promise<ClothingRow[]> {
  const { data, error } = await client
    .from("clothing_items")
    .select("id, photo_url, category, name")
    .in("id", itemIds);

  if (error) {
    console.error("Unable to read outfit items:", error.code);
    throw new HttpError(500, "ITEMS_READ_FAILED", "Unable to read outfit items.");
  }

  const rows = (data ?? []).filter((value): value is ClothingRow =>
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.photo_url === "string" &&
    isClothingCategory(value.category)
  );

  if (rows.length !== itemIds.length) {
    throw new HttpError(404, "ITEM_NOT_FOUND", "One or more outfit items are unavailable.");
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  return itemIds.map((id) => byId.get(id)).filter((row): row is ClothingRow => Boolean(row));
}

function tryOnOrder(left: ClothingRow, right: ClothingRow): number {
  const order: ClothingCategory[] = [
    "robe",
    "bas",
    "haut",
    "veste_manteau",
    "chaussures",
    "accessoire",
  ];
  return order.indexOf(left.category) - order.indexOf(right.category);
}

function falCategory(category: ClothingCategory): string {
  if (category === "haut" || category === "veste_manteau") return "upper_body";
  if (category === "bas") return "lower_body";
  if (category === "robe") return "full_body";
  if (category === "chaussures") return "shoes";
  return "accessories";
}

async function itemImageReference(
  client: SupabaseClient,
  userId: string,
  item: ClothingRow,
): Promise<string> {
  if (/^https?:\/\//i.test(item.photo_url)) return item.photo_url;
  const path = assertOwnedObjectPath(item.photo_url, userId);
  const encoded = await downloadEncodedImage(client, path);
  return `data:${encoded.mediaType};base64,${encoded.data}`;
}

function extractImageUrl(value: unknown): string | null {
  if (typeof value === "string" && /^(?:https?:|data:image\/)/i.test(value)) return value;
  if (!isRecord(value)) return null;

  const directKeys = [
    "imageUrl",
    "image_url",
    "output_url",
    "url",
  ];
  for (const key of directKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && /^(?:https?:|data:image\/)/i.test(candidate)) {
      return candidate;
    }
  }

  for (const key of ["image", "output", "result"]) {
    const candidate = extractImageUrl(value[key]);
    if (candidate) return candidate;
  }

  if (Array.isArray(value.images)) {
    for (const image of value.images) {
      const candidate = extractImageUrl(image);
      if (candidate) return candidate;
    }
  }

  return null;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isQueuedResponse(value: unknown): value is FalQueuedResponse {
  return isRecord(value) &&
    (typeof value.response_url === "string" || typeof value.status_url === "string");
}

async function pollQueuedFalResult(
  queued: FalQueuedResponse,
  headers: HeadersInit,
): Promise<unknown> {
  const deadline = Date.now() + MAX_PROVIDER_WAIT_MS;
  let nextUrl = queued.response_url ?? queued.status_url;

  while (nextUrl && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, PROVIDER_POLL_INTERVAL_MS));
    const response = await fetch(nextUrl, { headers });
    const data = await readJsonResponse(response);
    if (response.status === 202) {
      if (isRecord(data) && typeof data.response_url === "string") nextUrl = data.response_url;
      continue;
    }
    if (!response.ok) {
      console.error("FAL queued request failed:", response.status, JSON.stringify(data).slice(0, 300));
      throw new HttpError(502, "TRYON_PROVIDER_FAILED", "The try-on provider failed.");
    }
    return data;
  }

  throw new HttpError(504, "TRYON_PROVIDER_TIMEOUT", "The try-on provider took too long.");
}

async function callFalTryOn(
  currentModelImage: string,
  garmentImage: string,
  item: ClothingRow,
): Promise<string> {
  const headers = {
    Authorization: `Key ${requiredFalKey()}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(falModelEndpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model_image: currentModelImage,
      garment_image: garmentImage,
      category: falCategory(item.category),
      prompt:
        "Professional e-commerce fashion try-on on a realistic store mannequin, neutral elegant posture, clean studio lighting, natural fabric fit, no distortion, preserve garment colors and details.",
    }),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    console.error("FAL try-on failed:", response.status, JSON.stringify(data).slice(0, 300));
    throw new HttpError(502, "TRYON_PROVIDER_FAILED", "The try-on provider failed.");
  }

  const result = isQueuedResponse(data) ? await pollQueuedFalResult(data, headers) : data;
  const imageUrl = extractImageUrl(result);
  if (!imageUrl) {
    console.error("FAL try-on response without image:", JSON.stringify(result).slice(0, 300));
    throw new HttpError(502, "TRYON_IMAGE_MISSING", "The try-on provider returned no image.");
  }
  return imageUrl;
}

async function composeOutfit(
  client: SupabaseClient,
  userId: string,
  items: ClothingRow[],
): Promise<string> {
  let currentModelImage = mannequinReferenceUrl();
  for (const item of [...items].sort(tryOnOrder)) {
    const garmentImage = await itemImageReference(client, userId, item);
    currentModelImage = await callFalTryOn(currentModelImage, garmentImage, item);
  }
  return currentModelImage;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const guarded = guardRequest(request);
    if (guarded) return guarded;

    try {
      const { client, user } = await authenticatedContext(request);
      const body = await readJsonBody(request);
      const itemIds = itemIdsFromBody(body);
      const items = await loadOwnedItems(client, itemIds);
      const imageUrl = await composeOutfit(client, user.id, items);

      return jsonResponse(request, 200, {
        imageUrl,
        provider: "fal",
        steps: items.length,
        message: items.length > 1
          ? "Visuel IA créé en plusieurs étapes."
          : "Visuel IA créé.",
      });
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
