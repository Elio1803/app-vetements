const DAY_IN_MS = 86_400_000;

export type DateInput = Date | string | number;

export function asValidDate(value: DateInput | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoString(
  value: DateInput | null | undefined,
  fallback = new Date(),
): string {
  return (asValidDate(value) ?? fallback).toISOString();
}

export function startOfLocalDay(value: DateInput = new Date()): Date {
  const parsed = asValidDate(value) ?? new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Difference in local calendar days, unaffected by DST hour changes. */
export function calendarDaysBetween(from: DateInput, to: DateInput = new Date()): number {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.floor((endUtc - startUtc) / DAY_IN_MS));
}

export function daysSince(
  value: DateInput | null | undefined,
  now: DateInput = new Date(),
): number | null {
  const parsed = asValidDate(value);
  return parsed ? calendarDaysBetween(parsed, now) : null;
}

export function isToday(value: DateInput | null | undefined, now = new Date()): boolean {
  const parsed = asValidDate(value);
  if (!parsed) return false;
  return startOfLocalDay(parsed).getTime() === startOfLocalDay(now).getTime();
}

export function isoDaysAgo(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() - Math.max(0, Math.floor(days)));
  return date.toISOString();
}

export function formatShortDate(
  value: DateInput | null | undefined,
  locale = "fr-FR",
): string {
  const parsed = asValidDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatLastWorn(
  value: DateInput | null | undefined,
  now: DateInput = new Date(),
): string {
  const elapsed = daysSince(value, now);
  if (elapsed === null) return "Jamais portée";
  if (elapsed === 0) return "Portée aujourd’hui";
  if (elapsed === 1) return "Portée hier";
  if (elapsed < 7) return `Portée il y a ${elapsed} jours`;
  if (elapsed < 60) return `Pas portée depuis ${elapsed} jours`;
  return `Dernier port le ${formatShortDate(value)}`;
}
