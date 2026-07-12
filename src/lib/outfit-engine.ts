import type {
  ClothingCategory,
  ClothingItem,
  Occasion,
  OutfitSuggestion,
} from "../types";
import { daysSince } from "./dates";
import { groupItemsByCategory, sortByLeastRecentlyWorn } from "./wardrobe-utils";

const OUTFIT_NAMES: Record<Occasion, string[]> = {
  quotidien: ["Naturel maîtrisé", "Essentiel bien pensé", "Allure sans effort"],
  travail: ["Bureau en confiance", "Ligne précise", "Élégance active"],
  soiree: ["Reflets du soir", "Contraste feutré", "Après vingt heures"],
  sport: ["Mouvement libre", "Énergie douce", "Rythme du jour"],
  rendez_vous: ["Juste équilibre", "Présence subtile", "Détail complice"],
  habille: ["Silhouette signature", "Élégance calme", "Ligne de cérémonie"],
};

const FORMAL_OCCASIONS: Occasion[] = ["travail", "soiree", "rendez_vous", "habille"];

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function itemAt<T>(items: readonly T[], index: number): T | undefined {
  if (!items.length) return undefined;
  return items[((index % items.length) + items.length) % items.length];
}

function addUnique(target: ClothingItem[], item: ClothingItem | undefined): void {
  if (item && !target.some((candidate) => candidate.id === item.id)) target.push(item);
}

function createSuggestionId(variant: number): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (cryptoObject?.randomUUID) return `local-${cryptoObject.randomUUID()}`;
  return `local-${Date.now().toString(36)}-${variant}-${Math.random().toString(36).slice(2, 8)}`;
}

function describeReason(
  selected: readonly ClothingItem[],
  occasion: Occasion,
  note: string,
  now: Date,
): string {
  const forgotten = sortByLeastRecentlyWorn(selected, now)[0];
  const elapsed = forgotten ? daysSince(forgotten.lastWornAt, now) : null;
  const piece = forgotten?.name ?? "une pièce oubliée";
  const rotation =
    elapsed === null
      ? `La pièce « ${piece} », encore jamais portée, revient au centre de la silhouette`
      : `La pièce « ${piece} » revient dans la rotation après ${elapsed} jours`;
  const context = note.trim() ? `, tout en tenant compte de « ${note.trim()} »` : "";
  const finish = occasion === "sport" ? "mobile et facile à superposer" : "cohérente et facile à porter";
  return `${rotation}${context} : la tenue reste ${finish}.`;
}

function rankedPools(items: readonly ClothingItem[], now: Date) {
  const grouped = groupItemsByCategory(items);
  return Object.fromEntries(
    Object.entries(grouped).map(([category, values]) => [
      category,
      sortByLeastRecentlyWorn(values, now),
    ]),
  ) as Record<ClothingCategory, ClothingItem[]>;
}

/**
 * Offline stylist used by the demo and whenever the Edge Function is absent.
 * It never invents item ids and favours the least recently worn within each
 * category while rotating indices to keep proposals distinct.
 */
export function generateLocalOutfits(
  items: readonly ClothingItem[],
  occasion: Occasion,
  note = "",
  now = new Date(),
): OutfitSuggestion[] {
  if (!items.length) return [];

  const pool = rankedPools(items, now);
  const dayKey = now.toISOString().slice(0, 10);
  const seed = hashText(`${occasion}|${note.trim().toLocaleLowerCase("fr")}|${dayKey}`);
  const suggestions: OutfitSuggestion[] = [];
  const signatures = new Set<string>();
  const isFormal = FORMAL_OCCASIONS.includes(occasion);
  const feelsCold = /froid|frai|pluie|vent|hiver|manteau|veste/i.test(note);

  for (let attempt = 0; attempt < 18 && suggestions.length < 3; attempt += 1) {
    const variant = suggestions.length;
    const offset = seed + attempt;
    const selected: ClothingItem[] = [];
    const canUseDress = occasion !== "sport" && pool.robe.length > 0;
    const useDress = canUseDress && (attempt % 3 === 2 || (isFormal && attempt % 4 === 0));

    if (useDress) {
      addUnique(selected, itemAt(pool.robe, offset));
    } else {
      addUnique(selected, itemAt(pool.haut, offset));
      addUnique(selected, itemAt(pool.bas, offset + Math.floor(attempt / 2)));
      // Sparse wardrobes can still form their best available body layer.
      if (!selected.length) addUnique(selected, itemAt(pool.robe, offset));
    }

    addUnique(selected, itemAt(pool.chaussures, offset + attempt));

    if (feelsCold || isFormal || attempt % 2 === 1) {
      addUnique(selected, itemAt(pool.veste_manteau, offset + attempt));
    }
    if (occasion !== "sport" && (isFormal || attempt % 2 === 0)) {
      addUnique(selected, itemAt(pool.accessoire, offset + attempt));
    }

    if (!selected.length) addUnique(selected, itemAt(sortByLeastRecentlyWorn(items, now), offset));

    const signature = selected
      .map((item) => item.id)
      .sort()
      .join("|");
    if (!signature || signatures.has(signature)) continue;
    signatures.add(signature);

    suggestions.push({
      id: createSuggestionId(variant),
      name: OUTFIT_NAMES[occasion][variant] ?? `Tenue ${variant + 1}`,
      occasion,
      itemIds: selected.map((item) => item.id),
      reason: describeReason(selected, occasion, note, now),
      createdAt: now.toISOString(),
      source: "local",
    });
  }

  // With very small wardrobes, fulfil the three-card UI without inventing a
  // garment; the copy varies, while item ids stay truthful.
  while (suggestions.length > 0 && suggestions.length < 3) {
    const variant = suggestions.length;
    const base = suggestions[variant % suggestions.length];
    suggestions.push({
      ...base,
      id: createSuggestionId(variant),
      name: OUTFIT_NAMES[occasion][variant] ?? `Tenue ${variant + 1}`,
    });
  }

  return suggestions;
}
