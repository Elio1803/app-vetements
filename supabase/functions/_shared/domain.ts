export const CLOTHING_CATEGORIES = [
  "haut",
  "bas",
  "chaussures",
  "veste_manteau",
  "accessoire",
  "robe",
] as const;

export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];

export const OUTFIT_OCCASIONS = [
  "quotidien",
  "travail",
  "soiree",
  "sport",
  "rendez_vous",
  "habille",
] as const;

export type OutfitOccasion = (typeof OUTFIT_OCCASIONS)[number];

export function isClothingCategory(value: unknown): value is ClothingCategory {
  return typeof value === "string" &&
    (CLOTHING_CATEGORIES as readonly string[]).includes(value);
}

export function isOutfitOccasion(value: unknown): value is OutfitOccasion {
  return typeof value === "string" &&
    (OUTFIT_OCCASIONS as readonly string[]).includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(`${field} has an invalid length`);
  }

  return normalized;
}

export function integerFromEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = Deno.env.get(name);
  if (!rawValue) return fallback;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}
