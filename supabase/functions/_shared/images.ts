import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export const CLOTHING_BUCKET = "clothing-photos";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type SupportedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export interface EncodedImage {
  data: string;
  mediaType: SupportedImageMediaType;
  size: number;
}

export function assertOwnedObjectPath(value: unknown, userId: string): string {
  if (typeof value !== "string" || value.length < 38 || value.length > 512) {
    throw new HttpError(400, "INVALID_IMAGE_PATH", "Invalid image path.");
  }

  const parts = value.split("/");
  const hasUnsafePart = parts.some((part) =>
    part.length === 0 || part === "." || part === ".."
  );
  if (
    parts[0] !== userId ||
    hasUnsafePart ||
    value !== value.trim() ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new HttpError(403, "IMAGE_PATH_FORBIDDEN", "Image path is not owned by user.");
  }

  return value;
}

export function detectedMediaType(bytes: Uint8Array): SupportedImageMediaType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return "image/jpeg";

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "image/png";

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) return "image/gif";

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return "image/webp";

  return null;
}

export async function validateUploadedImage(
  file: File,
  maximumBytes: number,
): Promise<Exclude<SupportedImageMediaType, "image/gif">> {
  if (file.size === 0 || file.size > maximumBytes) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", "Image exceeds the size limit.");
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectedMediaType(header);
  if (!detected || detected === "image/gif") {
    throw new HttpError(
      415,
      "UNSUPPORTED_IMAGE",
      "Image must be JPEG, PNG, or WebP.",
    );
  }

  const declared = file.type.toLowerCase() === "image/jpg"
    ? "image/jpeg"
    : file.type.toLowerCase();
  if (declared && declared !== detected) {
    throw new HttpError(
      415,
      "IMAGE_TYPE_MISMATCH",
      "Image content does not match its declared type.",
    );
  }

  return detected;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function downloadEncodedImage(
  client: SupabaseClient,
  path: string,
  maximumBytes = MAX_IMAGE_BYTES,
): Promise<EncodedImage> {
  const { data, error } = await client.storage.from(CLOTHING_BUCKET).download(path);
  if (error || !data) {
    throw new HttpError(404, "IMAGE_NOT_FOUND", "Image not found.");
  }

  if (data.size === 0 || data.size > maximumBytes) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", "Image exceeds the size limit.");
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const mediaType = detectedMediaType(bytes);
  if (!mediaType) {
    throw new HttpError(
      415,
      "UNSUPPORTED_IMAGE",
      "Image must be JPEG, PNG, GIF, or WebP.",
    );
  }

  return { data: encodeBase64(bytes), mediaType, size: bytes.byteLength };
}
