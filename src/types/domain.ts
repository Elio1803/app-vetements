export const CLOTHING_CATEGORIES = [
  "haut",
  "bas",
  "chaussures",
  "veste_manteau",
  "accessoire",
  "robe",
] as const;

export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];

export const OCCASIONS = [
  "quotidien",
  "travail",
  "soiree",
  "sport",
  "rendez_vous",
  "habille",
] as const;

export type Occasion = (typeof OCCASIONS)[number];

/**
 * UI-ready shape mirroring `clothing_items` while keeping ISO strings easy to
 * persist and send through JSON. Sprite metadata is optional and only used by
 * the bundled demo wardrobe.
 */
export interface ClothingItem {
  id: string;
  userId: string;
  photoUrl: string;
  category: ClothingCategory;
  colorDominant: string | null;
  name: string | null;
  createdAt: string;
  lastWornAt: string | null;
  wearCount: number;
  photoPosition?: string;
  fallbackGradient?: string;
}

export interface NewClothingItem {
  id?: string;
  userId?: string;
  photoUrl: string;
  category: ClothingCategory;
  colorDominant?: string | null;
  name?: string | null;
  createdAt?: string;
  lastWornAt?: string | null;
  wearCount?: number;
  photoPosition?: string;
  fallbackGradient?: string;
}

export type ClothingItemPatch = Partial<
  Pick<
    ClothingItem,
    | "photoUrl"
    | "category"
    | "colorDominant"
    | "name"
    | "lastWornAt"
    | "wearCount"
    | "photoPosition"
    | "fallbackGradient"
  >
>;

export interface Outfit {
  id: string;
  userId: string;
  occasion: Occasion;
  itemIds: string[];
  aiReason: string;
  wornAt: string | null;
  createdAt: string;
  name?: string;
  note?: string;
}

export type OutfitSource = "ai" | "local";

export interface OutfitSuggestion {
  id: string;
  name: string;
  occasion: Occasion;
  itemIds: string[];
  reason: string;
  createdAt: string;
  source: OutfitSource;
}

export interface OutfitGenerationRequest {
  userId: string;
  occasion: Occasion;
  note?: string;
  items?: ClothingItem[];
}

export interface ClothingAnalysis {
  couleurDominante: string;
  nomSuggere: string;
}

export interface CategoryCount {
  category: ClothingCategory;
  count: number;
}

export interface WardrobeStats {
  totalItems: number;
  neverWorn: number;
  notWornFor30Days: number;
  totalWears: number;
  outfitsWorn: number;
  rotationScore: number;
  mostWornItem: ClothingItem | null;
  categoryCounts: Record<ClothingCategory, number>;
}

export interface WardrobeState {
  version: 1;
  userId: string;
  items: ClothingItem[];
  outfits: Outfit[];
  suggestions: OutfitSuggestion[];
  selectedOccasion: Occasion;
  lastUpdatedAt: string;
}

export interface MarkOutfitWornInput {
  suggestionId?: string;
  suggestion?: OutfitSuggestion;
  wornAt?: string;
}

export type WardrobeApiMode = "supabase" | "local";

