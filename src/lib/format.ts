import { useEffect, useState } from "react";

/*
 * Dates. Two kinds come from the API and they must never be mixed up:
 *   - a calendar DAY, "2026-10-06" (scheduled on, due on, issued on). It is
 *     shown exactly as written. Passing it to `new Date()` reads it as UTC
 *     midnight, which west of Greenwich prints the day BEFORE.
 *   - an INSTANT, an ISO timestamp (completed at, event starts at). It is shown
 *     in the department's time zone, not the device's.
 */

let tz: string | undefined;
let hour12 = true;

/** Times render in the department's timezone, not the laptop's. */
export function setDisplayTimezone(zone: string | null | undefined, use24Hour?: boolean) {
  tz = zone || undefined;
  hour12 = !use24Hour;
}

export function displayTimezone(): string {
  return tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayAsUtc(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** "Tue, Oct 6, 2026". */
export function formatDay(day: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!day || !DAY_RE.test(day)) return "—";
  return dayAsUtc(day).toLocaleDateString([], {
    timeZone: "UTC",
    weekday: opts.weekday === false ? undefined : "short",
    month: "short", day: "numeric",
    year: opts.year === false ? undefined : "numeric",
  });
}

/** "Oct 6". */
export function shortDay(day: string | null | undefined): string {
  return formatDay(day, { weekday: false, year: false });
}

/** The department's calendar day for an instant (or now). */
export function dayOf(instant: Date | string = new Date()): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", { timeZone: displayTimezone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function todayKey(): string {
  return dayOf(new Date());
}

export function addDays(day: string, days: number): string {
  return new Date(dayAsUtc(day).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayAsUtc(to).getTime() - dayAsUtc(from).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", "in 5 days", "3 days late". */
export function relativeDay(day: string | null | undefined, today = todayKey(), late = "late"): string {
  if (!day) return "";
  const n = daysBetween(today, day);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return late === "late" ? "1 day late" : "Yesterday";
  if (n > 1) return `in ${n} days`;
  return late === "late" ? `${-n} days late` : `${-n} days ago`;
}

/** "9:30 AM" (or "09:30") from "09:30". */
export function timeOfDay(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (!hour12) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** An instant as "Oct 6, 2:30 PM" in the department's time zone. */
export function dateTime(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", year: withYear ? "numeric" : undefined,
    hour: "numeric", minute: "2-digit", hour12, timeZone: tz,
  });
}

/** An instant's time only: "2:30 PM". */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12, timeZone: tz });
}

/** An instant's day, written out: "Tue, Oct 6, 2026". */
export function instantDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDay(dayOf(iso));
}

/** The offset of the department's zone from UTC at an instant, in minutes. */
function zoneOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: displayTimezone(), hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** A datetime-local value ("2026-10-06T14:30") meant in the department's zone, as an ISO instant. */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Twice, so a time just across a daylight-saving change lands right.
  let instant = guess - zoneOffsetMinutes(new Date(guess)) * 60_000;
  instant = guess - zoneOffsetMinutes(new Date(instant)) * 60_000;
  return new Date(instant).toISOString();
}

/** An ISO instant as a datetime-local value in the department's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() + zoneOffsetMinutes(d) * 60_000);
  return local.toISOString().slice(0, 16);
}

/** "$1,250.00". */
export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
}

/**
 * A place's name with its address, "Riverbend Pizza Kitchen, 1200 Meridian Pkwy…",
 * without saying the name twice when the address already starts with it
 * ("Demo City Park, 100 Park Ln" stays as it is).
 */
export function placeLine(name: string | null | undefined, address: string | null | undefined): string {
  const n = name?.trim(), a = address?.trim();
  if (!n) return a ?? "";
  if (!a) return n;
  return a.toLowerCase().startsWith(n.toLowerCase()) ? a : `${n}, ${a}`;
}

/** The address to show under a place's name, or null when the name already says it. */
export function addressUnder(name: string | null | undefined, address: string | null | undefined): string | null {
  const n = name?.trim(), a = address?.trim();
  if (!a) return null;
  if (!n) return a;
  if (a.toLowerCase() === n.toLowerCase()) return null;
  return a.toLowerCase().startsWith(`${n.toLowerCase()},`) ? a.slice(n.length + 1).trim() : a;
}

/** "1 violation", "3 violations". */
export function plural(n: number, one: string, other = `${one}s`): string {
  return `${n} ${n === 1 ? one : other}`;
}

/** A ticking clock, re-rendering once a minute (or as asked). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
