import {
  authenticatedContext,
  enforceApiRateLimit,
} from "../_shared/auth.ts";
import { validateUploadedImage } from "../_shared/images.ts";
import {
  assertAdvertisedRequestSize,
  errorResponse,
  guardRequest,
  HttpError,
  jsonResponse,
} from "../_shared/http.ts";

const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function requiredRemoveBgKey(): string {
  const value = Deno.env.get("REMOVE_BG_API_KEY")?.trim();
  if (!value) {
    throw new HttpError(
      500,
      "SERVER_CONFIGURATION_ERROR",
      "remove.bg is not configured.",
    );
  }
  return value;
}

async function readImageFile(request: Request): Promise<File> {
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
  const image = formData.get("image");
  if (!(image instanceof File)) {
    throw new HttpError(400, "IMAGE_REQUIRED", "Image file is required.");
  }
  const mediaType = await validateUploadedImage(image, MAX_IMAGE_BYTES);

  return new File([image], "clothing-upload", { type: mediaType });
}

async function removeBackgroundWithRemoveBg(image: File): Promise<Blob> {
  const formData = new FormData();
  formData.append("image_file", image, image.name || "clothing.jpg");
  formData.append("size", "auto");
  formData.append("format", "jpg");
  formData.append("bg_color", "FFFFFF");
  formData.append("crop", "true");
  formData.append("crop_margin", "8%");
  formData.append("position", "center");

  const response = await fetch(REMOVE_BG_ENDPOINT, {
    method: "POST",
    headers: { "X-Api-Key": requiredRemoveBgKey() },
    body: formData,
  });

  if (!response.ok) {
    await response.body?.cancel();
    console.error("remove.bg request failed:", response.status);
    if (response.status === 402) {
      throw new HttpError(402, "REMOVE_BG_CREDITS_REQUIRED", "remove.bg credits are required.");
    }
    if (response.status === 429) {
      throw new HttpError(429, "REMOVE_BG_RATE_LIMITED", "remove.bg rate limit reached.");
    }
    throw new HttpError(502, "REMOVE_BG_FAILED", "remove.bg could not process this image.");
  }
  const result = await response.blob();
  const mediaType = await validateUploadedImage(
    new File([result], "remove-bg-result", { type: result.type }),
    MAX_IMAGE_BYTES,
  );
  if (mediaType !== "image/jpeg") {
    throw new HttpError(502, "REMOVE_BG_INVALID_IMAGE", "remove.bg returned an invalid image.");
  }
  return result;
}

async function blobAsDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const guarded = guardRequest(request);
    if (guarded) return guarded;

    try {
      const { client } = await authenticatedContext(request);
      await enforceApiRateLimit(client, "remove_background");
      const image = await readImageFile(request);
      const result = await removeBackgroundWithRemoveBg(image);
      const imageDataUrl = await blobAsDataUrl(result);

      return jsonResponse(request, 200, { imageDataUrl });
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
