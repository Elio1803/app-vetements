import { describe, expect, it } from "vitest";

import type { ClothingCategory, ClothingItem } from "../types";
import { generateLocalOutfits } from "./outfit-engine";

function item(id: string, category: ClothingCategory, daysAgo: number): ClothingItem {
  const lastWornAt = new Date("2026-07-11T12:00:00.000Z");
  lastWornAt.setUTCDate(lastWornAt.getUTCDate() - daysAgo);
  return {
    id,
    userId: "test-user",
    photoUrl: `/photos/${id}.jpg`,
    category,
    colorDominant: null,
    name: id,
    createdAt: "2026-01-01T12:00:00.000Z",
    lastWornAt: lastWornAt.toISOString(),
    wearCount: 1,
  };
}

describe("generateLocalOutfits", () => {
  it("returns three truthful, wearable outfit structures", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    const items = [
      item("top-1", "haut", 50),
      item("top-2", "haut", 10),
      item("bottom-1", "bas", 45),
      item("bottom-2", "bas", 8),
      item("dress-1", "robe", 60),
      item("shoes-1", "chaussures", 30),
      item("shoes-2", "chaussures", 5),
      item("coat-1", "veste_manteau", 20),
      item("accessory-1", "accessoire", 15),
    ];
    const knownIds = new Set(items.map(({ id }) => id));
    const categoryById = new Map(items.map(({ id, category }) => [id, category]));

    const suggestions = generateLocalOutfits(
      items,
      "travail",
      "Une journée froide avec rendez-vous",
      now,
    );

    expect(suggestions).toHaveLength(3);
    expect(new Set(suggestions.map(({ id }) => id))).toHaveLength(3);

    for (const suggestion of suggestions) {
      const categories = new Set(
        suggestion.itemIds.map((id) => categoryById.get(id)),
      );
      const usesDress = categories.has("robe");
      const usesSeparates = categories.has("haut") && categories.has("bas");

      expect(suggestion.itemIds.length).toBeGreaterThan(0);
      expect(new Set(suggestion.itemIds).size).toBe(suggestion.itemIds.length);
      expect(suggestion.itemIds.every((id) => knownIds.has(id))).toBe(true);
      expect(usesDress || usesSeparates).toBe(true);
      expect(usesDress && (categories.has("haut") || categories.has("bas"))).toBe(false);
      expect(categories.has("chaussures")).toBe(true);
      expect(suggestion).toMatchObject({
        occasion: "travail",
        createdAt: now.toISOString(),
        source: "local",
      });
    }
  });
});
