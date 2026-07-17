import {
  CLOTHING_CATEGORIES,
  OCCASIONS,
  type ClothingCategory,
  type ClothingItem,
  type Occasion,
  type Outfit,
  type OutfitSuggestion,
  type WardrobeState,
} from "../types";
import { asValidDate } from "./dates";

export const WARDROBE_STORAGE_KEY = "le-dressing:wardrobe:v1";

export function wardrobeStorageKeyForAccount(userId: string): string {
  return `${WARDROBE_STORAGE_KEY}:account:${userId}`;
}

export interface WardrobePersistence {
  load(fallback: WardrobeState): WardrobeState;
  save(state: WardrobeState): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const memoryStorage = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isoValue(value: unknown, fallback = new Date().toISOString()): string {
  const parsed =
    typeof value === "string" || typeof value === "number" || value instanceof Date
      ? asValidDate(value)
      : null;
  return parsed?.toISOString() ?? fallback;
}

function nullableIsoValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "string" || typeof value === "number" || value instanceof Date
      ? asValidDate(value)
      : null;
  return parsed?.toISOString() ?? null;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function categoryValue(value: unknown): ClothingCategory | null {
  return typeof value === "string" &&
    (CLOTHING_CATEGORIES as readonly string[]).includes(value)
    ? (value as ClothingCategory)
    : null;
}

function occasionValue(value: unknown, fallback: Occasion = "quotidien"): Occasion {
  return typeof value === "string" && (OCCASIONS as readonly string[]).includes(value)
    ? (value as Occasion)
    : fallback;
}

export function createEntityId(prefix = "item"): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeClothingItem(
  value: unknown,
  fallbackUserId: string,
): ClothingItem | null {
  if (!isRecord(value)) return null;
  const category = categoryValue(value.category);
  const photoUrl = stringValue(value.photoUrl ?? value.photo_url).trim();
  if (!category || !photoUrl) return null;

  return {
    id: stringValue(value.id).trim() || createEntityId("item"),
    userId: stringValue(value.userId ?? value.user_id, fallbackUserId) || fallbackUserId,
    photoUrl,
    category,
    colorDominant: nullableString(value.colorDominant ?? value.color_dominant),
    name: nullableString(value.name),
    createdAt: isoValue(value.createdAt ?? value.created_at),
    lastWornAt: nullableIsoValue(value.lastWornAt ?? value.last_worn_at),
    wearCount: numberValue(value.wearCount ?? value.wear_count),
    ...(nullableString(value.photoPosition ?? value.photo_position)
      ? { photoPosition: nullableString(value.photoPosition ?? value.photo_position) ?? undefined }
      : {}),
    ...(nullableString(value.fallbackGradient ?? value.fallback_gradient)
      ? {
          fallbackGradient:
            nullableString(value.fallbackGradient ?? value.fallback_gradient) ?? undefined,
        }
      : {}),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
}

export function normalizeOutfit(value: unknown, fallbackUserId: string): Outfit | null {
  if (!isRecord(value)) return null;
  const itemIds = stringArray(value.itemIds ?? value.item_ids);
  if (!itemIds.length) return null;
  return {
    id: stringValue(value.id).trim() || createEntityId("outfit"),
    userId: stringValue(value.userId ?? value.user_id, fallbackUserId) || fallbackUserId,
    occasion: occasionValue(value.occasion),
    itemIds,
    aiReason: stringValue(value.aiReason ?? value.ai_reason ?? value.reason),
    wornAt: nullableIsoValue(value.wornAt ?? value.worn_at),
    createdAt: isoValue(value.createdAt ?? value.created_at),
    ...(nullableString(value.name) ? { name: nullableString(value.name) ?? undefined } : {}),
    ...(nullableString(value.note) ? { note: nullableString(value.note) ?? undefined } : {}),
  };
}

function normalizeSuggestion(value: unknown): OutfitSuggestion | null {
  if (!isRecord(value)) return null;
  const itemIds = stringArray(value.itemIds ?? value.item_ids);
  if (!itemIds.length) return null;
  const source = value.source === "ai" ? "ai" : "local";
  return {
    id: stringValue(value.id).trim() || createEntityId("suggestion"),
    name: stringValue(value.name ?? value.nom, "Tenue proposée"),
    occasion: occasionValue(value.occasion),
    itemIds,
    reason: stringValue(value.reason ?? value.raison ?? value.aiReason ?? value.ai_reason),
    createdAt: isoValue(value.createdAt ?? value.created_at),
    source,
  };
}

export function normalizeWardrobeState(
  value: unknown,
  fallback: WardrobeState,
): WardrobeState {
  if (!isRecord(value)) return fallback;
  const userId = stringValue(value.userId ?? value.user_id, fallback.userId) || fallback.userId;
  const itemSource = Array.isArray(value.items) ? value.items : fallback.items;
  const outfitSource = Array.isArray(value.outfits) ? value.outfits : fallback.outfits;
  const suggestionSource = Array.isArray(value.suggestions) ? value.suggestions : [];

  return {
    version: 1,
    userId,
    items: itemSource
      .map((item) => normalizeClothingItem(item, userId))
      .filter((item): item is ClothingItem => Boolean(item)),
    outfits: outfitSource
      .map((outfit) => normalizeOutfit(outfit, userId))
      .filter((outfit): outfit is Outfit => Boolean(outfit)),
    suggestions: suggestionSource
      .map(normalizeSuggestion)
      .filter((suggestion): suggestion is OutfitSuggestion => Boolean(suggestion)),
    selectedOccasion: occasionValue(value.selectedOccasion ?? value.selected_occasion),
    lastUpdatedAt: isoValue(value.lastUpdatedAt ?? value.last_updated_at),
  };
}

export function createWardrobePersistence(
  key = WARDROBE_STORAGE_KEY,
): WardrobePersistence {
  function browserStorage(): Storage | null {
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  function readRaw(): string | null {
    try {
      return browserStorage()?.getItem(key) ?? memoryStorage.get(key) ?? null;
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  }

  return {
    load(fallback) {
      const raw = readRaw();
      if (!raw) return fallback;
      try {
        return normalizeWardrobeState(JSON.parse(raw) as unknown, fallback);
      } catch {
        // A malformed payload must never prevent the app from starting.
        return fallback;
      }
    },
    save(state) {
      const serialized = JSON.stringify(state);
      memoryStorage.set(key, serialized);
      try {
        browserStorage()?.setItem(key, serialized);
      } catch {
        // Quota/private-mode failures remain functional for the current tab.
      }
    },
    clear() {
      memoryStorage.delete(key);
      try {
        browserStorage()?.removeItem(key);
      } catch {
        // No-op: memory fallback was still cleared.
      }
    },
    subscribe(listener) {
      if (typeof window === "undefined") return () => undefined;
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
