import { useSyncExternalStore } from "react";
import type { WardrobeState } from "../types";
import { wardrobeStore } from "./wardrobe-store";

/** Reactive view of the dependency-free external store. */
export function useWardrobeStore(): WardrobeState {
  return useSyncExternalStore(
    wardrobeStore.subscribe,
    wardrobeStore.getSnapshot,
    wardrobeStore.getSnapshot,
  );
}
