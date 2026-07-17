import { afterEach, describe, expect, it, vi } from "vitest";
import type { WardrobeState } from "../types";
import type { WardrobePersistence } from "./storage";
import { SupabaseWardrobeApi } from "./wardrobe-api";
import { WardrobeStore } from "./wardrobe-store";

function emptyState(): WardrobeState {
  return {
    version: 1,
    userId: "test-user",
    items: [],
    outfits: [],
    suggestions: [],
    selectedOccasion: "quotidien",
    lastUpdatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function memoryPersistence(): WardrobePersistence {
  return {
    load: (fallback) => fallback,
    save: () => undefined,
    clear: () => undefined,
    subscribe: () => () => undefined,
  };
}

afterEach(() => vi.useRealTimers());

describe("SupabaseWardrobeApi network resilience", () => {
  it("abandons a stalled request and keeps the local wardrobe available", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException("Aborted", "AbortError"));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
      })) as unknown as typeof fetch;
    const store = new WardrobeStore(emptyState(), memoryPersistence());
    const api = new SupabaseWardrobeApi({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "public-test-key",
      accessToken: "test-token",
      fetcher,
      store,
    });

    const request = api.listItems("test-user");
    await vi.advanceTimersByTimeAsync(15_001);

    await expect(request).resolves.toEqual([]);
    expect(api.lastRemoteError?.message).toContain("pris trop de temps");
    expect(fetcher).toHaveBeenCalledTimes(1);
    store.dispose();
  });
});
