import type { ClothingItem, Outfit, WardrobeState } from "../types";
import { isoDaysAgo } from "./dates";

export const DEMO_USER_ID = "demo-user";
export const DEMO_SPRITE_URL = `${import.meta.env.BASE_URL}assets/wardrobe-sprite.png`;

interface DemoItemSeed {
  id: string;
  name: string;
  category: ClothingItem["category"];
  color: string;
  position: string;
  gradient: string;
  lastWornDays: number | null;
  wearCount: number;
}

const DEMO_ITEM_SEEDS: DemoItemSeed[] = [
  {
    id: "demo-pull-ecru",
    name: "Pull texturé écru",
    category: "haut",
    color: "écru",
    position: "0% 0%",
    gradient: "linear-gradient(145deg, #d8d0c0, #f5f0e7)",
    lastWornDays: null,
    wearCount: 0,
  },
  {
    id: "demo-pantalon-chocolat",
    name: "Pantalon droit chocolat",
    category: "bas",
    color: "chocolat",
    position: "50% 0%",
    gradient: "linear-gradient(145deg, #4b3027, #81604e)",
    lastWornDays: 41,
    wearCount: 3,
  },
  {
    id: "demo-mocassins-bruns",
    name: "Mocassins en cuir brun",
    category: "chaussures",
    color: "brun",
    position: "100% 0%",
    gradient: "linear-gradient(145deg, #56392b, #9a6d4e)",
    lastWornDays: 31,
    wearCount: 6,
  },
  {
    id: "demo-trench-camel",
    name: "Trench mi-long camel",
    category: "veste_manteau",
    color: "camel",
    position: "0% 50%",
    gradient: "linear-gradient(145deg, #9f7954, #d2b18c)",
    lastWornDays: 9,
    wearCount: 7,
  },
  {
    id: "demo-chemise-rayee",
    name: "Chemise rayée bleu ciel",
    category: "haut",
    color: "bleu ciel",
    position: "50% 50%",
    gradient: "linear-gradient(145deg, #b7c8d0, #eef3f1)",
    lastWornDays: 18,
    wearCount: 5,
  },
  {
    id: "demo-jean-bleu",
    name: "Jean droit bleu",
    category: "bas",
    color: "bleu denim",
    position: "100% 50%",
    gradient: "linear-gradient(145deg, #304d68, #718ca6)",
    lastWornDays: 2,
    wearCount: 12,
  },
  {
    id: "demo-baskets-ecrues",
    name: "Baskets minimalistes écrues",
    category: "chaussures",
    color: "écru",
    position: "0% 100%",
    gradient: "linear-gradient(145deg, #d7d1c5, #fffdf8)",
    lastWornDays: 1,
    wearCount: 16,
  },
  {
    id: "demo-robe-bordeaux",
    name: "Robe satin bordeaux",
    category: "robe",
    color: "bordeaux",
    position: "50% 100%",
    gradient: "linear-gradient(145deg, #572630, #944a58)",
    lastWornDays: null,
    wearCount: 0,
  },
  {
    id: "demo-foulard-olive",
    name: "Foulard olive et crème",
    category: "accessoire",
    color: "olive et crème",
    position: "100% 100%",
    gradient: "linear-gradient(145deg, #777553, #dfd6be)",
    lastWornDays: 67,
    wearCount: 2,
  },
];

export function createDemoItems(now = new Date()): ClothingItem[] {
  return DEMO_ITEM_SEEDS.map((seed, index) => ({
    id: seed.id,
    userId: DEMO_USER_ID,
    photoUrl: DEMO_SPRITE_URL,
    photoPosition: seed.position,
    fallbackGradient: seed.gradient,
    category: seed.category,
    colorDominant: seed.color,
    name: seed.name,
    createdAt: isoDaysAgo(95 - index * 4, now),
    lastWornAt:
      seed.lastWornDays === null ? null : isoDaysAgo(seed.lastWornDays, now),
    wearCount: seed.wearCount,
  }));
}

export function createDemoOutfits(now = new Date()): Outfit[] {
  return [
    {
      id: "demo-outfit-weekend",
      userId: DEMO_USER_ID,
      occasion: "quotidien",
      itemIds: ["demo-chemise-rayee", "demo-jean-bleu", "demo-baskets-ecrues"],
      name: "Le week-end net",
      aiReason:
        "Une base claire et simple, structurée par le jean brut et facile à porter toute la journée.",
      wornAt: isoDaysAgo(6, now),
      createdAt: isoDaysAgo(6, now),
    },
  ];
}

export function createDemoWardrobeState(now = new Date()): WardrobeState {
  return {
    version: 1,
    userId: DEMO_USER_ID,
    items: createDemoItems(now),
    outfits: createDemoOutfits(now),
    suggestions: [],
    selectedOccasion: "quotidien",
    lastUpdatedAt: now.toISOString(),
  };
}

// Convenient immutable-at-import snapshots for read-only previews.
export const DEMO_ITEMS = createDemoItems();
export const DEMO_OUTFITS = createDemoOutfits();
