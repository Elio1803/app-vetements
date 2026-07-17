import type {
  ClothingCategory,
  ClothingItem,
  Occasion,
  OutfitSuggestion,
  WeatherContext,
} from "../types";
import { daysSince } from "./dates";
import { groupItemsByCategory, sortByLeastRecentlyWorn } from "./wardrobe-utils";
import { isWetWeather, weatherConditionLabel } from "./weather";

const OUTFIT_NAMES: Record<Occasion, string[]> = {
  quotidien: ["Naturel maîtrisé", "Essentiel bien pensé", "Allure sans effort"],
  travail: ["Bureau en confiance", "Ligne précise", "Élégance active"],
  soiree: ["Reflets du soir", "Contraste feutré", "Après vingt heures"],
  sport: ["Mouvement libre", "Énergie douce", "Rythme du jour"],
  rendez_vous: ["Juste équilibre", "Présence subtile", "Détail complice"],
  habille: ["Silhouette signature", "Élégance calme", "Ligne de cérémonie"],
};

const FORMAL_OCCASIONS: Occasion[] = ["travail", "soiree", "rendez_vous", "habille"];
type WardrobeSeason = "printemps" | "ete" | "automne" | "hiver";

const COLD_SEASONS: WardrobeSeason[] = ["automne", "hiver"];

export function wardrobeSeasonLabel(season: WardrobeSeason): string {
  return season === "ete" ? "été" : season;
}

export function wardrobeSeasonForDate(date: Date): WardrobeSeason {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "printemps";
  if (month >= 5 && month <= 7) return "ete";
  if (month >= 8 && month <= 10) return "automne";
  return "hiver";
}

function itemSeasonScore(
  item: ClothingItem,
  season: WardrobeSeason,
  occasion: Occasion,
  weather?: WeatherContext | null,
): number {
  const text = `${item.name ?? ""} ${item.colorDominant ?? ""}`.toLocaleLowerCase("fr");
  let score = 0;
  const feelsLike = weather?.apparentTemperatureC;
  const isActuallyCold = feelsLike !== undefined && feelsLike <= 14;
  const isActuallyHot = feelsLike !== undefined && feelsLike >= 25;
  const wetWeather = weather ? isWetWeather(weather) : false;

  if (item.category === "veste_manteau") {
    score += weather
      ? isActuallyCold ? 10 : wetWeather ? 6 : isActuallyHot ? -10 : -1
      : COLD_SEASONS.includes(season) ? 7 : -2;
  }
  if (item.category === "accessoire") score += COLD_SEASONS.includes(season) || FORMAL_OCCASIONS.includes(occasion) ? 2 : 0;
  if (item.category === "robe") score += season === "ete" || FORMAL_OCCASIONS.includes(occasion) ? 3 : season === "hiver" ? -2 : 0;

  if (/manteau|doudoune|laine|pull|col roulé|col roule|sweat|cardigan|veste|bottes|écharpe|echarpe/i.test(text)) {
    score += weather
      ? isActuallyCold ? 7 : wetWeather ? 3 : isActuallyHot ? -7 : 0
      : COLD_SEASONS.includes(season) ? 5 : -2;
  }
  if (/short|débardeur|debardeur|lin|sandale|t-shirt|tee-shirt|jupe|robe légère|robe legere/i.test(text)) {
    score += weather
      ? isActuallyHot ? 7 : isActuallyCold ? -7 : wetWeather && /sandale/i.test(text) ? -5 : 0
      : season === "ete" ? 5 : season === "hiver" ? -4 : 0;
  }
  if (/noir|marine|gris|marron|bordeaux|beige/i.test(text)) score += COLD_SEASONS.includes(season) ? 1 : 0;
  if (/blanc|crème|creme|pastel|rose|bleu clair/i.test(text)) score += season === "printemps" || season === "ete" ? 1 : 0;

  return score;
}

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
  weather?: WeatherContext | null,
): string {
  const season = wardrobeSeasonForDate(now);
  const forgotten = sortByLeastRecentlyWorn(selected, now)[0];
  const elapsed = forgotten ? daysSince(forgotten.lastWornAt, now) : null;
  const piece = forgotten?.name ?? "une pièce oubliée";
  const rotation =
    elapsed === null
      ? `La pièce « ${piece} », encore jamais portée, revient au centre de la silhouette`
      : `La pièce « ${piece} » revient dans la rotation après ${elapsed} jours`;
  const context = note.trim() ? `, tout en tenant compte de « ${note.trim()} »` : "";
  const finish = occasion === "sport" ? "mobile et facile à superposer" : "cohérente et facile à porter";
  const readableSeason = wardrobeSeasonLabel(season);
  const seasonDetail = weather
    ? ` en tenant compte des ${Math.round(weather.apparentTemperatureC)} °C ressentis et du ${weatherConditionLabel(weather.condition)}`
    : COLD_SEASONS.includes(season)
      ? ` avec une attention aux couches adaptées à l’${readableSeason}`
      : ` avec une silhouette adaptée à la saison ${readableSeason}`;
  return `${rotation}${context} : la tenue reste ${finish}${seasonDetail}.`;
}

function rankedPools(
  items: readonly ClothingItem[],
  occasion: Occasion,
  now: Date,
  weather?: WeatherContext | null,
) {
  const season = wardrobeSeasonForDate(now);
  const grouped = groupItemsByCategory(items);
  return Object.fromEntries(
    Object.entries(grouped).map(([category, values]) => [
      category,
      sortByLeastRecentlyWorn(values, now).sort((a, b) => (
        itemSeasonScore(b, season, occasion, weather) - itemSeasonScore(a, season, occasion, weather)
      )),
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
  weather?: WeatherContext | null,
): OutfitSuggestion[] {
  if (!items.length) return [];

  const pool = rankedPools(items, occasion, now, weather);
  const season = wardrobeSeasonForDate(now);
  const dayKey = now.toISOString().slice(0, 10);
  const weatherSeed = weather
    ? `${Math.round(weather.apparentTemperatureC)}|${weather.condition}|${weather.precipitationMm}`
    : "season-only";
  const seed = hashText(`${occasion}|${note.trim().toLocaleLowerCase("fr")}|${dayKey}|${weatherSeed}`);
  const suggestions: OutfitSuggestion[] = [];
  const signatures = new Set<string>();
  const isFormal = FORMAL_OCCASIONS.includes(occasion);
  const feelsCold = weather
    ? weather.apparentTemperatureC <= 14 || isWetWeather(weather)
    : COLD_SEASONS.includes(season) || /froid|frai|pluie|vent|hiver|manteau|veste/i.test(note);
  const feelsWarm = weather
    ? weather.apparentTemperatureC >= 25 && !isWetWeather(weather)
    : season === "ete" || /chaud|soleil|été|ete|canicule|léger|leger/i.test(note);

  for (let attempt = 0; attempt < 18 && suggestions.length < 3; attempt += 1) {
    const variant = suggestions.length;
    const offset = seed + attempt;
    const selected: ClothingItem[] = [];
    const canUseDress = occasion !== "sport" && pool.robe.length > 0;
    const useDress = canUseDress && (
      (feelsWarm && attempt % 2 === 0) ||
      attempt % 3 === 2 ||
      (isFormal && attempt % 4 === 0)
    );

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
      reason: describeReason(selected, occasion, note, now, weather),
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
