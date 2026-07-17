import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  authenticatedContext,
  enforceApiRateLimit,
} from "../_shared/auth.ts";
import {
  CLOTHING_BUCKET,
  type SupportedImageMediaType,
  validateUploadedImage,
} from "../_shared/images.ts";
import {
  assertAdvertisedRequestSize,
  errorResponse,
  guardRequest,
  HttpError,
  jsonResponse,
} from "../_shared/http.ts";
import {
  isClothingCategory,
  optionalBoundedString,
  type ClothingCategory,
} from "../_shared/domain.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface SafeImageUpload {
  file: File;
  mediaType: Exclude<SupportedImageMediaType, "image/gif">;
}

function optionalText(
  value: FormDataEntryValue | null,
  field: string,
  maxLength: number,
): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_TEXT_FIELD", `${field} must be text.`);
  }
  try {
    return optionalBoundedString(value, field, maxLength);
  } catch {
    throw new HttpError(400, "INVALID_TEXT_FIELD", `${field} is invalid.`);
  }
}

async function imageFromForm(formData: FormData): Promise<SafeImageUpload> {
  const image = formData.get("image");
  if (!(image instanceof File)) {
    throw new HttpError(400, "IMAGE_REQUIRED", "Image file is required.");
  }
  const mediaType = await validateUploadedImage(image, MAX_IMAGE_BYTES);
  return { file: image, mediaType };
}

function categoryFromForm(formData: FormData): ClothingCategory {
  const value = formData.get("category");
  if (!isClothingCategory(value)) {
    throw new HttpError(400, "INVALID_CATEGORY", "Unknown clothing category.");
  }
  return value;
}

function optionalUuid(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new HttpError(400, "INVALID_CLIENT_ITEM_ID", "clientItemId must be a UUID.");
  }
  return normalized;
}

async function ensurePublicUser(userId: string, email: string | null): Promise<void> {
  const client = adminClient();

  const normalizedEmail = email?.trim().toLowerCase() || null;
  const profilePayload = normalizedEmail
    ? { id: userId, email: normalizedEmail }
    : { id: userId };

  const { error: upsertError } = await client
    .from("users")
    .upsert(profilePayload, { onConflict: "id" });

  if (!upsertError) return;
  console.error("Unable to ensure public user:", upsertError.code);
  throw new HttpError(500, "USER_SYNC_FAILED", "Unable to prepare user profile.");
}

export default {
  async fetch(request: Request): Promise<Response> {
    const guarded = guardRequest(request);
    if (guarded) return guarded;

    let uploadedPath: string | null = null;
    let authenticatedClient: SupabaseClient | null = null;
    try {
      const { client, user } = await authenticatedContext(request);
      authenticatedClient = client;
      await enforceApiRateLimit(client, "sync_clothing_item");
      assertAdvertisedRequestSize(request, MAX_IMAGE_BYTES + 128 * 1024);
      const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("multipart/form-data")) {
        throw new HttpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Content-Type must be multipart/form-data.",
        );
      }

      const formData = await request.formData();
      const image = await imageFromForm(formData);
      const category = categoryFromForm(formData);
      const clientItemId = optionalUuid(formData.get("clientItemId"));
      const name = optionalText(formData.get("name"), "name", 160);
      const colorDominant = optionalText(
        formData.get("colorDominant"),
        "colorDominant",
        80,
      );

      await ensurePublicUser(user.id, user.email ?? null);

      if (clientItemId) {
        const { data: existingItem, error: existingError } = await client
          .from("clothing_items")
          .select("id, user_id, photo_url, category, color_dominant, name, created_at, last_worn_at, wear_count")
          .eq("id", clientItemId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existingError) {
          console.error("Unable to check existing clothing item:", existingError.code);
          throw new HttpError(500, "ITEM_LOOKUP_FAILED", "Unable to check existing clothing item.");
        }

        if (existingItem) {
          return jsonResponse(request, 200, {
            item: existingItem,
            photoPath: existingItem.photo_url,
            alreadySynced: true,
          });
        }
      }

      const extension = image.mediaType === "image/png"
        ? "png"
        : image.mediaType === "image/webp"
          ? "webp"
          : "jpg";
      uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await client.storage
        .from(CLOTHING_BUCKET)
        .upload(uploadedPath, image.file, {
          contentType: image.mediaType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Unable to upload clothing photo.");
        throw new HttpError(500, "PHOTO_UPLOAD_FAILED", "Unable to upload clothing photo.");
      }

      const { data, error: insertError } = await client
        .from("clothing_items")
        .insert({
          ...(clientItemId ? { id: clientItemId } : {}),
          user_id: user.id,
          photo_url: uploadedPath,
          category,
          name,
          color_dominant: colorDominant,
        })
        .select("id, user_id, photo_url, category, color_dominant, name, created_at, last_worn_at, wear_count")
        .single();

      if (insertError || !data) {
        console.error("Unable to insert clothing item:", insertError?.code);
        await client.storage.from(CLOTHING_BUCKET).remove([uploadedPath]).catch(() => undefined);
        uploadedPath = null;
        throw new HttpError(500, "ITEM_INSERT_FAILED", "Unable to save clothing item.");
      }

      return jsonResponse(request, 200, {
        item: data,
        photoPath: uploadedPath,
      });
    } catch (error) {
      if (uploadedPath && authenticatedClient) {
        await authenticatedClient.storage.from(CLOTHING_BUCKET).remove([uploadedPath])
          .catch(() => undefined);
      }
      return errorResponse(request, error);
    }
  },
};
