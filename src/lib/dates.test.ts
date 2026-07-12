import { describe, expect, it } from "vitest";

import type { ClothingItem } from "../types";
import { calendarDaysBetween, daysSince, isToday } from "./dates";
import { sortByLeastRecentlyWorn } from "./wardrobe-utils";

function item(
  id: string,
  lastWornAt: string | null,
  wearCount = 0,
  createdAt = "2026-01-01T12:00:00.000Z",
): ClothingItem {
  return {
    id,
    userId: "test-user",
    photoUrl: `/photos/${id}.jpg`,
    category: "haut",
    colorDominant: null,
    name: id,
    createdAt,
    lastWornAt,
    wearCount,
  };
}

describe("date helpers", () => {
  it("counts local calendar days instead of elapsed 24-hour periods", () => {
    const from = new Date(2026, 2, 28, 23, 30);
    const to = new Date(2026, 2, 30, 0, 15);

    expect(calendarDaysBetween(from, to)).toBe(2);
    expect(daysSince(from, to)).toBe(2);
  });

  it("only identifies dates from the same local calendar day as today", () => {
    const now = new Date(2026, 6, 11, 12, 0);

    expect(isToday(new Date(2026, 6, 11, 0, 1), now)).toBe(true);
    expect(isToday(new Date(2026, 6, 10, 23, 59), now)).toBe(false);
    expect(isToday(new Date(2026, 6, 12, 0, 1), now)).toBe(false);
    expect(isToday(null, now)).toBe(false);
  });
});

describe("sortByLeastRecentlyWorn", () => {
  it("prioritizes never-worn and long-forgotten items without mutating the input", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    const input = [
      item("recent", "2026-07-10T12:00:00.000Z", 1),
      item("never", null, 0, "2026-02-01T12:00:00.000Z"),
      item("forgotten", "2026-05-01T12:00:00.000Z", 4),
    ];

    expect(sortByLeastRecentlyWorn(input, now).map(({ id }) => id)).toEqual([
      "never",
      "forgotten",
      "recent",
    ]);
    expect(input.map(({ id }) => id)).toEqual(["recent", "never", "forgotten"]);
  });

  it("uses the lower wear count to break equal recency", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    const sameLastWornAt = "2026-06-11T12:00:00.000Z";

    const sorted = sortByLeastRecentlyWorn(
      [item("often", sameLastWornAt, 12), item("rarely", sameLastWornAt, 2)],
      now,
    );

    expect(sorted.map(({ id }) => id)).toEqual(["rarely", "often"]);
  });
});
