// Dates for the CRM and the calendar. Everything is India time (Asia/Kolkata), as in the FynoLabs
// admin: dates are plain "YYYY-MM-DD" strings, times "HH:MM". Pure, so it is easy to test.
import { CALENDAR_TIMEZONE } from "@/lib/constants";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Today's date in India. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CALENDAR_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The date in India of an instant ("2026-11-24"). */
export const dateIST = (d: Date) => todayIST(d);

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Monday of the week the date is in. */
export function weekStart(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

export function addMonths(iso: string, n: number): string {
  const d = new Date(`${monthStart(iso)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** The weeks (Monday to Sunday) that cover the month of `iso`, for a month grid. */
export function monthGrid(iso: string): string[][] {
  const first = monthStart(iso);
  const next = addMonths(first, 1);
  const weeks: string[][] = [];
  let d = weekStart(first);
  while (d < next) {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) w.push(addDays(d, i));
    weeks.push(w);
    d = addDays(d, 7);
  }
  return weeks;
}

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

/** "5 Nov" (plus the year when it isn't this year). */
export function shortDay(iso: string | null | undefined, today?: string): string {
  if (!iso) return "–";
  const withYear = today ? iso.slice(0, 4) !== today.slice(0, 4) : false;
  return fmt(iso, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

/** "Wednesday 30 October". */
export const longDay = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
/** "Wed 30 Oct". */
export const mediumDay = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
/** "November 2026". */
export const monthTitle = (iso: string) => fmt(iso, { month: "long", year: "numeric" });

/** "Today", "Tomorrow", "Yesterday" or null. */
export function relativeDay(iso: string, today: string): string | null {
  const n = daysBetween(today, iso);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : null;
}

/** "14:00" from "14:00:00". */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
export const isTime = (s: unknown): s is string => typeof s === "string" && TIME.test(s);

/** The instant of a date and time in India (12:00 when there is no time), as a Date. */
export function istInstant(date: string, time?: string | null): Date {
  const t = hhmm(time) ?? "12:00";
  return new Date(`${date}T${t}:00+05:30`);
}

/** Days from `start` to `end` inclusive. */
export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
