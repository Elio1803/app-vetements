import type {
  ClothingAnalysis,
  ClothingCategory,
  ClothingItem,
  ClothingItemPatch,
  NewClothingItem,
  Outfit,
  OutfitCompositionRequest,
  OutfitCompositionResult,
  OutfitGenerationRequest,
  OutfitSuggestion,
  WardrobeApiMode,
} from "../types";
import { createEntityId, normalizeClothingItem } from "./storage";
import { CATEGORY_LABELS_SINGULAR } from "./wardrobe-utils";
import { wardrobeStore, type WardrobeStore } from "./wardrobe-store";

interface SupabaseClothingCreateRow {
  user_id: string;
  photo_url: string;
  category: ClothingCategory;
  color_dominant: string | null;
  name: string | null;
}

export interface WardrobeApiOptions {
  supabaseUrl?: string;
  anonKey?: string;
  accessToken?: string | (() => string | null | Promise<string | null>);
  fetcher?: typeof fetch;
  store?: WardrobeStore;
  onFallback?: (error: unknown) => void;
}

export interface WardrobeApi {
  readonly mode: WardrobeApiMode;
  readonly lastRemoteError: Error | null;
  setAccessToken(token: WardrobeApiOptions["accessToken"]): void;
  listItems(userId: string): Promise<ClothingItem[]>;
  createItem(input: NewClothingItem & { userId: string }): Promise<ClothingItem>;
  updateItem(id: string, patch: ClothingItemPatch): Promise<ClothingItem | null>;
  deleteItem(id: string): Promise<boolean>;
  analyzeClothing(imagePath: string, category: ClothingCategory): Promise<ClothingAnalysis>;
  generateOutfits(request: OutfitGenerationRequest): Promise<OutfitSuggestion[]>;
  composeOutfit(request: OutfitCompositionRequest): Promise<OutfitCompositionResult>;
  markOutfitWorn(suggestion: OutfitSuggestion, wornAt?: string): Promise<Outfit>;
}

function readViteEnv(key: string): string | undefined {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  };
  const value = meta.env?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function stripMarkdownFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonText(value: string): unknown {
  if (!value.trim()) return null;
  return JSON.parse(stripMarkdownFence(value)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function toClothingCreateRow(item: ClothingItem): SupabaseClothingCreateRow {
  return {
    user_id: item.userId,
    photo_url: item.photoUrl,
    category: item.category,
    color_dominant: item.colorDominant,
    name: item.name,
  };
}

function toPatchRow(patch: ClothingItemPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.colorDominant !== undefined) row.color_dominant = patch.colorDominant;
  if (patch.name !== undefined) row.name = patch.name;
  // `last_worn_at` and `wear_count` are intentionally RPC-only so both fields
  // stay atomic and cannot be forged through the regular RLS update policy.
  return row;
}

export class SupabaseWardrobeApi implements WardrobeApi {
  private readonly supabaseUrl?: string;
  private readonly anonKey?: string;
  private accessToken?: WardrobeApiOptions["accessToken"];
  private readonly fetcher: typeof fetch;
  private readonly store: WardrobeStore;
  private readonly onFallback?: (error: unknown) => void;
  private remoteError: Error | null = null;

  constructor(options: WardrobeApiOptions = {}) {
    this.supabaseUrl = (options.supabaseUrl ?? readViteEnv("VITE_SUPABASE_URL"))?.replace(
      /\/$/,
      "",
    );
    this.anonKey = options.anonKey ?? readViteEnv("VITE_SUPABASE_ANON_KEY");
    this.accessToken = options.accessToken;
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.store = options.store ?? wardrobeStore;
    this.onFallback = options.onFallback;
  }

  get mode(): WardrobeApiMode {
    return this.supabaseUrl && this.anonKey ? "supabase" : "local";
  }

  get lastRemoteError(): Error | null {
    return this.remoteError;
  }

  setAccessToken(token: WardrobeApiOptions["accessToken"]): void {
    this.accessToken = token;
  }

  private async token(): Promise<string | null> {
    if (typeof this.accessToken === "function") return (await this.accessToken()) ?? null;
    return this.accessToken ?? null;
  }

  private async headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await this.token();
    return {
      apikey: this.anonKey ?? "",
      Authorization: `Bearer ${token ?? this.anonKey ?? ""}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.supabaseUrl || !this.anonKey) throw new Error("Supabase n’est pas configuré.");
    const response = await this.fetcher(`${this.supabaseUrl}${path}`, {
      ...init,
      headers: await this.headers(init.headers as Record<string, string> | undefined),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Supabase ${response.status}: ${body || response.statusText}`);
    }
    return parseJsonText(body);
  }

  private recordFallback(error: unknown): void {
    this.remoteError = asError(error);
    this.onFallback?.(error);
  }

  private syncItem(item: ClothingItem): ClothingItem {
    const existing = this.store.getSnapshot().items.some((candidate) => candidate.id === item.id);
    if (existing) return this.store.updateItem(item.id, item) ?? item;
    return this.store.addItem(item);
  }

  async listItems(userId: string): Promise<ClothingItem[]> {
    if (this.mode === "local") return this.store.getSnapshot().items;
    try {
      const data = await this.request(
        `/rest/v1/clothing_items?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
        { headers: { Accept: "application/json" } },
      );
      if (!Array.isArray(data)) throw new Error("Réponse clothing_items invalide.");
      const items = data
        .map((row) => normalizeClothingItem(row, userId))
        .filter((item): item is ClothingItem => Boolean(item));
      this.store.replaceItems(items);
      this.remoteError = null;
      return items;
    } catch (error) {
      this.recordFallback(error);
      return this.store.getSnapshot().items;
    }
  }

  async createItem(input: NewClothingItem & { userId: string }): Promise<ClothingItem> {
    const localCandidate = normalizeClothingItem(
      {
        ...input,
        id: input.id ?? createEntityId("item"),
        createdAt: input.createdAt ?? new Date().toISOString(),
        lastWornAt: input.lastWornAt ?? null,
        wearCount: input.wearCount ?? 0,
      },
      input.userId,
    );
    if (!localCandidate) throw new Error("La pièce doit avoir une photo et une catégorie valides.");
    if (this.mode === "local") return this.syncItem(localCandidate);

    try {
      const data = await this.request("/rest/v1/clothing_items", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(toClothingCreateRow(localCandidate)),
      });
      if (!Array.isArray(data) || !data[0]) throw new Error("Création Supabase sans résultat.");
      const created = normalizeClothingItem(data[0], input.userId);
      if (!created) throw new Error("Pièce Supabase invalide.");
      this.remoteError = null;
      return this.syncItem(created);
    } catch (error) {
      this.recordFallback(error);
      throw asError(error);
    }
  }

  async updateItem(id: string, patch: ClothingItemPatch): Promise<ClothingItem | null> {
    if (this.mode === "local") return this.store.updateItem(id, patch);
    try {
      const data = await this.request(`/rest/v1/clothing_items?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(toPatchRow(patch)),
      });
      if (!Array.isArray(data) || !data[0]) return null;
      const updated = normalizeClothingItem(data[0], this.store.getSnapshot().userId);
      if (!updated) throw new Error("Mise à jour Supabase invalide.");
      this.remoteError = null;
      return this.syncItem(updated);
    } catch (error) {
      this.recordFallback(error);
      throw asError(error);
    }
  }

  async deleteItem(id: string): Promise<boolean> {
    if (this.mode === "local") return this.store.removeItem(id);
    try {
      await this.request(`/rest/v1/clothing_items?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      this.remoteError = null;
      return this.store.removeItem(id);
    } catch (error) {
      this.recordFallback(error);
      throw asError(error);
    }
  }

  async analyzeClothing(
    imagePath: string,
    category: ClothingCategory,
  ): Promise<ClothingAnalysis> {
    const local = {
      couleurDominante: "non détectée",
      nomSuggere: CATEGORY_LABELS_SINGULAR[category],
    };
    if (this.mode === "local") return local;
    try {
      const data = await this.request("/functions/v1/analyze-clothing", {
        method: "POST",
        body: JSON.stringify({ imagePath, category }),
      });
      if (!isRecord(data)) throw new Error("Analyse vêtement invalide.");
      const couleurDominante = data.couleur_dominante;
      const nomSuggere = data.nom_suggere;
      if (typeof couleurDominante !== "string" || typeof nomSuggere !== "string") {
        throw new Error("Champs d’analyse manquants.");
      }
      this.remoteError = null;
      return { couleurDominante, nomSuggere };
    } catch (error) {
      this.recordFallback(error);
      return local;
    }
  }

  private parseSuggestions(
    data: unknown,
    request: OutfitGenerationRequest,
  ): OutfitSuggestion[] {
    if (!isRecord(data) || !Array.isArray(data.tenues)) {
      throw new Error("Réponse de génération invalide.");
    }
    const allowedIds = new Set(
      (request.items ?? this.store.getSnapshot().items).map((item) => item.id),
    );
    const createdAt = new Date().toISOString();
    return data.tenues.slice(0, 3).map((value, index) => {
      if (!isRecord(value)) throw new Error(`Tenue ${index + 1} invalide.`);
      const itemIds = Array.isArray(value.itemIds)
        ? value.itemIds.filter(
            (itemId): itemId is string => typeof itemId === "string" && allowedIds.has(itemId),
          )
        : [];
      if (!itemIds.length || typeof value.nom !== "string" || typeof value.raison !== "string") {
        throw new Error(`Tenue ${index + 1} incomplète.`);
      }
      return {
        id: isUuid(value.id) ? value.id : createEntityId("ai-outfit"),
        name: value.nom,
        occasion: request.occasion,
        itemIds: [...new Set(itemIds)],
        reason: value.raison,
        createdAt,
        source: "ai" as const,
      };
    });
  }

  async generateOutfits(request: OutfitGenerationRequest): Promise<OutfitSuggestion[]> {
    if (this.mode === "local") {
      return this.store.generateOutfits(request.occasion, request.note, request.weather);
    }

    let lastError: unknown;
    // Stable across the single automatic retry so the Edge Function can
    // return the persisted result without a second Anthropic charge.
    const requestId = globalThis.crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await this.request("/functions/v1/generate-outfits", {
          method: "POST",
          body: JSON.stringify({
            requestId,
            occasion: request.occasion,
            note: request.note?.trim() || undefined,
            weather: request.weather ?? undefined,
          }),
        });
        const suggestions = this.parseSuggestions(data, request);
        this.store.setSuggestions(suggestions, request.occasion);
        this.remoteError = null;
        return suggestions;
      } catch (error) {
        lastError = error;
      }
    }
    this.recordFallback(lastError);
    return this.store.generateOutfits(request.occasion, request.note, request.weather);
  }

  async composeOutfit(
    request: OutfitCompositionRequest,
  ): Promise<OutfitCompositionResult> {
    if (this.mode === "local") {
      return {
        imageUrl: "",
        provider: "local",
        message: "Le rendu IA nécessite la synchronisation cloud.",
      };
    }

    try {
      const data = await this.request("/functions/v1/compose-outfit", {
        method: "POST",
        body: JSON.stringify({
          suggestionId: request.suggestion.id,
          itemIds: request.suggestion.itemIds,
        }),
      });
      if (!isRecord(data)) throw new Error("Réponse de composition invalide.");
      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";
      const message = typeof data.message === "string" ? data.message : undefined;
      if (!imageUrl) throw new Error(message || "Image de tenue indisponible.");
      this.remoteError = null;
      return {
        imageUrl,
        provider: data.provider === "fal" ? "fal" : "local",
        message,
      };
    } catch (error) {
      this.recordFallback(error);
      throw asError(error);
    }
  }

  async markOutfitWorn(
    suggestion: OutfitSuggestion,
    wornAt = new Date().toISOString(),
  ): Promise<Outfit> {
    if (this.mode === "local") return this.store.markOutfitWorn(suggestion, wornAt);
    // Local fallback suggestions were never persisted remotely and therefore
    // have no valid RPC target.
    if (suggestion.source !== "ai" || !isUuid(suggestion.id)) {
      return this.store.markOutfitWorn(suggestion, wornAt);
    }
    try {
      await this.request("/rest/v1/rpc/mark_outfit_worn", {
        method: "POST",
        body: JSON.stringify({ p_outfit_id: suggestion.id }),
      });
      this.remoteError = null;
      return this.store.markOutfitWorn(suggestion, wornAt);
    } catch (error) {
      this.recordFallback(error);
      throw asError(error);
    }
  }
}

export const wardrobeApi: WardrobeApi = new SupabaseWardrobeApi();
