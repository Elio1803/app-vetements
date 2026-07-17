import { describe, expect, it } from "vitest";

import type { ClothingCategory, ClothingItem } from "../types";
import { generateLocalOutfits, generationReadinessFor } from "./outfit-engine";

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

  it("prioritizes a warm layer during winter", () => {
    const now = new Date("2026-01-11T12:00:00.000Z");
    const items = [
      item("top-1", "haut", 5),
      item("bottom-1", "bas", 4),
      item("shoes-1", "chaussures", 3),
      item("coat-1", "veste_manteau", 2),
    ];

    const suggestions = generateLocalOutfits(items, "quotidien", "", now);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((suggestion) => suggestion.itemIds.includes("coat-1"))).toBe(true);
    expect(suggestions[0].reason).toContain("hiver");
  });

  it("uses real cold and rainy weather even during summer", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    const items = [
      item("top-1", "haut", 5),
      item("bottom-1", "bas", 4),
      item("shoes-1", "chaussures", 3),
      item("coat-1", "veste_manteau", 2),
    ];

    const suggestions = generateLocalOutfits(items, "quotidien", "", now, {
      temperatureC: 12,
      apparentTemperatureC: 9,
      precipitationMm: 1.2,
      weatherCode: 61,
      windSpeedKmh: 22,
      condition: "rain",
      observedAt: now.toISOString(),
      source: "open-meteo",
    });

    expect(suggestions.every((suggestion) => suggestion.itemIds.includes("coat-1"))).toBe(true);
    expect(suggestions[0].reason).toContain("9 °C ressentis");
    expect(suggestions[0].reason).toContain("pluie");
  });
});

describe("generationReadinessFor", () => {
  const summer = new Date("2026-07-11T12:00:00.000Z");
  const winter = new Date("2026-01-11T12:00:00.000Z");
  const separates = [item("top", "haut", 2), item("bottom", "bas", 2)];

  it("requires a complete body layer", () => {
    const readiness = generationReadinessFor([item("top", "haut", 2)], "quotidien", summer);
    expect(readiness.canGenerate).toBe(false);
    expect(readiness.message).toContain("un haut et un bas");
  });

  it("requires shoes for formal occasions", () => {
    const readiness = generationReadinessFor(separates, "travail", summer);
    expect(readiness.canGenerate).toBe(false);
    expect(readiness.message).toContain("chaussures");
  });

  it("requires a warm layer in winter", () => {
    const readiness = generationReadinessFor(separates, "quotidien", winter);
    expect(readiness.canGenerate).toBe(false);
    expect(readiness.message).toContain("hiver");
  });

  it("accepts a season-ready wardrobe and reports live weather", () => {
    const readiness = generationReadinessFor([
      ...separates,
      item("coat", "veste_manteau", 2),
    ], "quotidien", summer, {
      temperatureC: 12,
      apparentTemperatureC: 9,
      precipitationMm: 1.2,
      weatherCode: 61,
      windSpeedKmh: 22,
      condition: "rain",
      observedAt: summer.toISOString(),
      source: "open-meteo",
    });
    expect(readiness.canGenerate).toBe(true);
    expect(readiness.message).toContain("9 °C ressentis");
    expect(readiness.message).toContain("pluie");
  });
});
