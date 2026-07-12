import {
  CLOTHING_CATEGORIES,
  type ClothingCategory,
  type ClothingItem,
  type Occasion,
  type Outfit,
  type WardrobeStats,
} from "../types";
import { daysSince } from "./dates";

export const CATEGORY_LABELS: Record<ClothingCategory, string> = {
  haut: "Hauts",
  bas: "Bas",
  chaussures: "Chaussures",
  veste_manteau: "Vestes & manteaux",
  accessoire: "Accessoires",
  robe: "Robes",
};

export const CATEGORY_LABELS_SINGULAR: Record<ClothingCategory, string> = {
  haut: "Haut",
  bas: "Bas",
  chaussures: "Chaussures",
  veste_manteau: "Veste / manteau",
  accessoire: "Accessoire",
  robe: "Robe",
};

export const OCCASION_LABELS: Record<Occasion, string> = {
  quotidien: "Au quotidien",
  travail: "Travail",
  soiree: "Soirée",
  sport: "Sport",
  rendez_vous: "Rendez-vous",
  habille: "Habillé",
};

/** Higher means the item should be brought back into rotation sooner. */
export function neglectScore(item: ClothingItem, now = new Date()): number {
  const elapsed = daysSince(item.lastWornAt, now);
  if (elapsed === null) {
    const age = daysSince(item.createdAt, now) ?? 0;
    return 100_000 + age;
  }
  return elapsed * 100 - Math.min(item.wearCount, 99);
}

export function sortByLeastRecentlyWorn(
  items: readonly ClothingItem[],
  now = new Date(),
): ClothingItem[] {
  return [...items].sort((a, b) => {
    const priority = neglectScore(b, now) - neglectScore(a, now);
    if (priority !== 0) return priority;
    return a.name?.localeCompare(b.name ?? "", "fr") ?? -1;
  });
}

export function groupItemsByCategory(
  items: readonly ClothingItem[],
): Record<ClothingCategory, ClothingItem[]> {
  const grouped = CLOTHING_CATEGORIES.reduce(
    (result, category) => {
      result[category] = [];
      return result;
    },
    {} as Record<ClothingCategory, ClothingItem[]>,
  );

  for (const item of items) grouped[item.category].push(item);
  return grouped;
}

export function calculateWardrobeStats(
  items: readonly ClothingItem[],
  outfits: readonly Outfit[] = [],
  now = new Date(),
): WardrobeStats {
  const categoryCounts = Object.fromEntries(
    CLOTHING_CATEGORIES.map((category) => [category, 0]),
  ) as Record<ClothingCategory, number>;

  let neverWorn = 0;
  let notWornFor30Days = 0;
  let totalWears = 0;
  let recentlyWorn = 0;
  let mostWornItem: ClothingItem | null = null;

  for (const item of items) {
    categoryCounts[item.category] += 1;
    totalWears += item.wearCount;
    if (!item.lastWornAt) neverWorn += 1;
    const elapsed = daysSince(item.lastWornAt, now);
    if (elapsed === null || elapsed >= 30) notWornFor30Days += 1;
    if (elapsed !== null && elapsed < 30) recentlyWorn += 1;
    if (!mostWornItem || item.wearCount > mostWornItem.wearCount) {
      mostWornItem = item;
    }
  }

  return {
    totalItems: items.length,
    neverWorn,
    notWornFor30Days,
    totalWears,
    outfitsWorn: outfits.filter((outfit) => Boolean(outfit.wornAt)).length,
    rotationScore: items.length ? Math.round((recentlyWorn / items.length) * 100) : 0,
    mostWornItem,
    categoryCounts,
  };
}
