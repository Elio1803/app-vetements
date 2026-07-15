import { adminClient, authenticatedContext } from "../_shared/auth.ts";
import { CLOTHING_BUCKET } from "../_shared/images.ts";
import {
  errorResponse,
  guardRequest,
  HttpError,
  jsonResponse,
} from "../_shared/http.ts";
import {
  isClothingCategory,
  type ClothingCategory,
} from "../_shared/domain.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function optionalText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

async function imageFromForm(formData: FormData): Promise<File> {
  const image = formData.get("image");
  if (!(image instanceof File)) {
    throw new HttpError(400, "IMAGE_REQUIRED", "Image file is required.");
  }
  if (!image.type.startsWith("image/")) {
    throw new HttpError(400, "INVALID_IMAGE", "File must be an image.");
  }
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", "Image must be 5 MB or smaller.");
  }
  return image;
}

function categoryFromForm(formData: FormData): ClothingCategory {
  const value = formData.get("category");
  if (!isClothingCategory(value)) {
    throw new HttpError(400, "INVALID_CATEGORY", "Unknown clothing category.");
  }
  return value;
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

  // Older test accounts can leave a stale public.users row with the same e-mail
  // but a different auth id. In that case, free the e-mail and retry with the
  // current authenticated id so wardrobe sync is not blocked on mobile.
  if (normalizedEmail && upsertError.code === "23505") {
    const { error: releaseEmailError } = await client
      .from("users")
      .update({ email: `stale-${crypto.randomUUID()}@local.invalid` })
      .eq("email", normalizedEmail)
      .neq("id", userId);

    if (releaseEmailError) {
      console.warn(
        "Unable to release stale user e-mail:",
        releaseEmailError.code,
        releaseEmailError.message,
      );
    }

    const { error: retryError } = await client
      .from("users")
      .upsert(profilePayload, { onConflict: "id" });

    if (!retryError) return;
    console.error("Unable to ensure public user after retry:", retryError.code, retryError.message);
  }

  if (upsertError) {
    console.error("Unable to ensure public user:", upsertError.code, upsertError.message);
    throw new HttpError(500, "USER_SYNC_FAILED", "Unable to prepare user profile.");
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const guarded = guardRequest(request);
    if (guarded) return guarded;

    let uploadedPath: string | null = null;
    try {
      const { user } = await authenticatedContext(request);
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
      const name = optionalText(formData.get("name"), 160);
      const colorDominant = optionalText(formData.get("colorDominant"), 80);
      const client = adminClient();

      await ensurePublicUser(user.id, user.email ?? null);

      const extension = image.type.includes("png")
        ? "png"
        : image.type.includes("webp")
          ? "webp"
          : image.type.includes("gif")
            ? "gif"
            : "jpg";
      uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await client.storage
        .from(CLOTHING_BUCKET)
        .upload(uploadedPath, image, {
          contentType: image.type || "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Unable to upload clothing photo:", uploadError.message);
        throw new HttpError(500, "PHOTO_UPLOAD_FAILED", "Unable to upload clothing photo.");
      }

      const { data, error: insertError } = await client
        .from("clothing_items")
        .insert({
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
      if (uploadedPath) {
        await adminClient().storage.from(CLOTHING_BUCKET).remove([uploadedPath]).catch(() => undefined);
      }
      return errorResponse(request, error);
    }
  },
};
