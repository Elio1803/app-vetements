import type {
  ClothingItem,
  ClothingItemPatch,
  NewClothingItem,
  Occasion,
  Outfit,
  OutfitSuggestion,
  WardrobeState,
  WardrobeStats,
} from "../types";
import { createDemoWardrobeState } from "./demo-data";
import { toIsoString } from "./dates";
import { generateLocalOutfits } from "./outfit-engine";
import {
  createEntityId,
  createWardrobePersistence,
  normalizeClothingItem,
  type WardrobePersistence,
} from "./storage";
import { calculateWardrobeStats } from "./wardrobe-utils";

export type WardrobeListener = () => void;

export class WardrobeStore {
  private state: WardrobeState;
  private readonly listeners = new Set<WardrobeListener>();
  private readonly persistence: WardrobePersistence;
  private readonly stopPersistenceSubscription: () => void;

  constructor(
    initialState = createDemoWardrobeState(),
    persistence = createWardrobePersistence(),
  ) {
    this.persistence = persistence;
    this.state = persistence.load(initialState);
    this.stopPersistenceSubscription = persistence.subscribe(() => {
      const incoming = this.persistence.load(this.state);
      if (incoming.lastUpdatedAt === this.state.lastUpdatedAt) return;
      this.state = incoming;
      this.emit();
    });
  }

  getSnapshot = (): WardrobeState => this.state;

  subscribe = (listener: WardrobeListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private commit(next: WardrobeState): void {
    this.state = { ...next, version: 1, lastUpdatedAt: new Date().toISOString() };
    this.persistence.save(this.state);
    this.emit();
  }

  addItem(input: NewClothingItem): ClothingItem {
    const candidate = normalizeClothingItem(
      {
        ...input,
        id: input.id ?? createEntityId("item"),
        userId: input.userId ?? this.state.userId,
        createdAt: input.createdAt ?? new Date().toISOString(),
        wearCount: input.wearCount ?? 0,
        lastWornAt: input.lastWornAt ?? null,
      },
      this.state.userId,
    );
    if (!candidate) throw new Error("La pièce doit avoir une photo et une catégorie valides.");
    this.commit({ ...this.state, items: [candidate, ...this.state.items] });
    return candidate;
  }

  updateItem(id: string, patch: ClothingItemPatch): ClothingItem | null {
    const current = this.state.items.find((item) => item.id === id);
    if (!current) return null;
    const updated = normalizeClothingItem({ ...current, ...patch, id }, this.state.userId);
    if (!updated) throw new Error("La mise à jour rendrait la pièce invalide.");
    this.commit({
      ...this.state,
      items: this.state.items.map((item) => (item.id === id ? updated : item)),
    });
    return updated;
  }

  removeItem(id: string): boolean {
    if (!this.state.items.some((item) => item.id === id)) return false;
    this.commit({
      ...this.state,
      items: this.state.items.filter((item) => item.id !== id),
      suggestions: this.state.suggestions
        .map((suggestion) => ({
          ...suggestion,
          itemIds: suggestion.itemIds.filter((itemId) => itemId !== id),
        }))
        .filter((suggestion) => suggestion.itemIds.length > 0),
    });
    return true;
  }

  setOccasion(occasion: Occasion): void {
    if (occasion === this.state.selectedOccasion) return;
    this.commit({ ...this.state, selectedOccasion: occasion });
  }

  generateOutfits(occasion: Occasion, note = ""): OutfitSuggestion[] {
    const suggestions = generateLocalOutfits(this.state.items, occasion, note);
    this.commit({ ...this.state, selectedOccasion: occasion, suggestions });
    return suggestions;
  }

  setSuggestions(suggestions: OutfitSuggestion[], occasion?: Occasion): void {
    this.commit({
      ...this.state,
      suggestions,
      selectedOccasion: occasion ?? this.state.selectedOccasion,
    });
  }

  markOutfitWorn(
    suggestionOrId: OutfitSuggestion | string,
    wornAt = new Date().toISOString(),
  ): Outfit {
    const suggestion =
      typeof suggestionOrId === "string"
        ? this.state.suggestions.find((candidate) => candidate.id === suggestionOrId)
        : suggestionOrId;
    if (!suggestion) throw new Error("Cette proposition de tenue est introuvable.");

    const outfitId = `worn-${suggestion.id}`;
    const alreadyWorn = this.state.outfits.find((outfit) => outfit.id === outfitId);
    if (alreadyWorn) return alreadyWorn;

    const wornAtIso = toIsoString(wornAt);
    const selectedIds = new Set(suggestion.itemIds);
    const outfit: Outfit = {
      id: outfitId,
      userId: this.state.userId,
      occasion: suggestion.occasion,
      itemIds: [...suggestion.itemIds],
      name: suggestion.name,
      aiReason: suggestion.reason,
      wornAt: wornAtIso,
      createdAt: suggestion.createdAt,
    };

    this.commit({
      ...this.state,
      items: this.state.items.map((item) =>
        selectedIds.has(item.id)
          ? { ...item, lastWornAt: wornAtIso, wearCount: item.wearCount + 1 }
          : item,
      ),
      outfits: [outfit, ...this.state.outfits],
    });
    return outfit;
  }

  replaceItems(items: ClothingItem[]): void {
    const normalized = items
      .map((item) => normalizeClothingItem(item, this.state.userId))
      .filter((item): item is ClothingItem => Boolean(item));
    this.commit({ ...this.state, items: normalized });
  }

  getStats(now = new Date()): WardrobeStats {
    return calculateWardrobeStats(this.state.items, this.state.outfits, now);
  }

  resetDemo(): void {
    this.commit(createDemoWardrobeState());
  }

  clear(): void {
    this.persistence.clear();
    this.commit({
      version: 1,
      userId: this.state.userId,
      items: [],
      outfits: [],
      suggestions: [],
      selectedOccasion: "quotidien",
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  dispose(): void {
    this.stopPersistenceSubscription();
    this.listeners.clear();
  }
}

export const wardrobeStore = new WardrobeStore();

