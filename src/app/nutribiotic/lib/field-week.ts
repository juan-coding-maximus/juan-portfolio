/**
 * The planning horizon: today's field days rolling ten weekdays deep, always
 * Monday-Friday. NOT boxed into "this week" or "next week" -- Juan's ask
 * 2026-08-24: postponing off Thursday hit a wall with only four Mon-Thu tabs.
 * A rolling horizon has no wall. It just slides forward one day at a time as
 * the calendar does, so there is always somewhere to postpone a stop to.
 *
 * Pure, no I/O, and deliberately NOT tagged "server-only": dal.ts (server)
 * and route-context.tsx (client) both need this, and a value import of
 * anything from dal.ts into a client file drags the whole server-only module
 * into the browser bundle -- Next.js refuses to build that. This file has
 * nothing in it worth keeping off the client anyway.
 */

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export const PLANNING_HORIZON_DAYS = 10;

/** "2026-08-23", 1 (Monday). Los Angeles wall-clock, not the server's zone:
    this app has one territory and it is not UTC. */
function laToday(): { iso: string; weekdayIso: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { iso: `${get("year")}-${get("month")}-${get("day")}`, weekdayIso: WEEKDAY[get("weekday")] ?? 1 };
}

/** "2026-08-25" -> 2 (Tuesday). Anchored at UTC noon so parsing the bare date
    never rolls the weekday back a day west of Greenwich. */
function weekdayIsoOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

/**
 * The next `count` weekdays (Monday-Friday only, weekends skipped), starting
 * today if today is a weekday, else the coming Monday. Always real field days
 * out from right now -- there is no "this week" or "next week" box for the
 * horizon to fall off the edge of.
 */
export function planningHorizonDates(count: number = PLANNING_HORIZON_DAYS): string[] {
  const { iso } = laToday();
  const [y, m, d] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  const out: string[] = [];
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** The next date on the horizon landing on `weekdayIso` (1=Mon..5=Fri), today
    included. Used once, to migrate a pre-day-tabs route onto Wednesday
    (2026-08-23) without hard-coding a position in a list whose composition
    now depends on what day it is. Seven weekdays always contain every
    weekday value at least once, so this never comes back empty. */
export function nextWeekday(weekdayIso: number): string {
  return planningHorizonDates(7).find((d) => weekdayIsoOf(d) === weekdayIso) ?? planningHorizonDates(1)[0];
}

/** Today if it's on the horizon, else the first day on it with stops in it,
    else the first day. Never a day with nothing to show and nothing to plan. */
export function defaultActiveDay(byDay: Record<string, unknown[] | undefined>, days: string[]): string {
  const { iso } = laToday();
  if (days.includes(iso)) return iso;
  return days.find((d) => (byDay[d]?.length ?? 0) > 0) ?? days[0];
}
