import { describe, expect, it } from "vitest";

import type {
  ClothingCategory,
  ClothingItem,
  OutfitSuggestion,
  WardrobeState,
} from "../types";
import {
  createWardrobePersistence,
  wardrobeStorageKeyForAccount,
  type WardrobePersistence,
} from "./storage";
import { WardrobeStore } from "./wardrobe-store";

function cloneState(state: WardrobeState): WardrobeState {
  return JSON.parse(JSON.stringify(state)) as WardrobeState;
}

function createIsolatedMemoryPersistence(): WardrobePersistence {
  let stored: WardrobeState | null = null;

  return {
    load(fallback) {
      return cloneState(stored ?? fallback);
    },
    save(state) {
      stored = cloneState(state);
    },
    clear() {
      stored = null;
    },
    subscribe() {
      return () => undefined;
    },
  };
}

function emptyState(): WardrobeState {
  return {
    version: 1,
    userId: "test-user",
    items: [],
    outfits: [],
    suggestions: [],
    selectedOccasion: "quotidien",
    lastUpdatedAt: "2026-07-11T00:00:00.000Z",
  };
}

function item(
  id: string,
  category: ClothingCategory,
  wearCount = 0,
): ClothingItem {
  return {
    id,
    userId: "test-user",
    photoUrl: `/photos/${id}.jpg`,
    category,
    colorDominant: null,
    name: id,
    createdAt: "2026-01-01T12:00:00.000Z",
    lastWornAt: null,
    wearCount,
  };
}

describe("WardrobeStore CRUD", () => {
  it("adds, updates, removes, and restores items through isolated memory persistence", () => {
    const persistence = createIsolatedMemoryPersistence();
    const firstStore = new WardrobeStore(emptyState(), persistence);

    const added = firstStore.addItem({
      id: "item-1",
      photoUrl: "/photos/item-1.jpg",
      category: "haut",
      name: "Chemise",
    });
    expect(added).toMatchObject({
      id: "item-1",
      userId: "test-user",
      name: "Chemise",
      wearCount: 0,
    });

    const updated = firstStore.updateItem("item-1", {
      category: "veste_manteau",
      name: "Surchemise",
      wearCount: 3,
    });
    expect(updated).toMatchObject({
      id: "item-1",
      category: "veste_manteau",
      name: "Surchemise",
      wearCount: 3,
    });
    expect(firstStore.updateItem("missing", { name: "Introuvable" })).toBeNull();
    firstStore.dispose();

    const restoredStore = new WardrobeStore(emptyState(), persistence);
    expect(restoredStore.getSnapshot().items).toEqual([updated]);
    expect(restoredStore.removeItem("item-1")).toBe(true);
    expect(restoredStore.removeItem("item-1")).toBe(false);
    restoredStore.dispose();

    const afterRemovalStore = new WardrobeStore(emptyState(), persistence);
    expect(afterRemovalStore.getSnapshot().items).toEqual([]);
    afterRemovalStore.dispose();
  });

  it("migrates the current wardrobe into a newly created account", () => {
    const initial = emptyState();
    initial.items = [item("top", "haut")];
    const firstStore = new WardrobeStore(initial, createIsolatedMemoryPersistence());

    firstStore.switchToAccount("new-account", true);
    expect(firstStore.getSnapshot().items[0]).toMatchObject({
      id: "top",
      userId: "new-account",
    });
    firstStore.dispose();

    const restoredStore = new WardrobeStore(
      { ...emptyState(), userId: "new-account" },
      createWardrobePersistence(wardrobeStorageKeyForAccount("new-account")),
    );
    expect(restoredStore.getSnapshot().items).toHaveLength(1);
    restoredStore.dispose();
  });
});

describe("WardrobeStore.markOutfitWorn", () => {
  it("is idempotent, including after restoring persisted state", () => {
    const persistence = createIsolatedMemoryPersistence();
    const suggestion: OutfitSuggestion = {
      id: "suggestion-1",
      name: "Tenue test",
      occasion: "travail",
      itemIds: ["top", "bottom", "shoes"],
      reason: "Une rotation équilibrée.",
      createdAt: "2026-07-10T08:00:00.000Z",
      source: "local",
    };
    const initial = emptyState();
    initial.items = [
      item("top", "haut", 4),
      item("bottom", "bas", 1),
      item("shoes", "chaussures", 0),
      item("unrelated", "accessoire", 2),
    ];
    initial.suggestions = [suggestion];

    const firstStore = new WardrobeStore(initial, persistence);
    const first = firstStore.markOutfitWorn(
      suggestion.id,
      "2026-07-11T09:30:00.000Z",
    );
    const second = firstStore.markOutfitWorn(
      suggestion.id,
      "2026-07-12T09:30:00.000Z",
    );

    expect(second).toEqual(first);
    expect(firstStore.getSnapshot().outfits).toEqual([first]);
    expect(
      firstStore.getSnapshot().items.map(({ id, wearCount, lastWornAt }) => ({
        id,
        wearCount,
        lastWornAt,
      })),
    ).toEqual([
      { id: "top", wearCount: 5, lastWornAt: "2026-07-11T09:30:00.000Z" },
      { id: "bottom", wearCount: 2, lastWornAt: "2026-07-11T09:30:00.000Z" },
      { id: "shoes", wearCount: 1, lastWornAt: "2026-07-11T09:30:00.000Z" },
      { id: "unrelated", wearCount: 2, lastWornAt: null },
    ]);
    firstStore.dispose();

    const restoredStore = new WardrobeStore(emptyState(), persistence);
    const afterRestore = restoredStore.markOutfitWorn(
      suggestion.id,
      "2026-07-13T09:30:00.000Z",
    );
    expect(afterRestore).toEqual(first);
    expect(restoredStore.getSnapshot().outfits).toHaveLength(1);
    expect(restoredStore.getSnapshot().items.map(({ wearCount }) => wearCount)).toEqual([
      5,
      2,
      1,
      2,
    ]);
    restoredStore.dispose();
  });
});
