/**
 * The field week's four dates (Monday-Thursday), and which one is "today" by
 * default. Pure, no I/O, and deliberately NOT tagged "server-only": dal.ts
 * (server) and route-context.tsx (client) both need this, and a value import
 * of anything from dal.ts into a client file drags the whole server-only
 * module into the browser bundle -- Next.js refuses to build that. This file
 * has nothing in it worth keeping off the client anyway.
 */

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

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

/**
 * The four field days (Monday through Thursday, plan_week.py's rhythm) for
 * whichever week is current: this week's if today is Mon-Thu, next week's if
 * today is Fri/Sat/Sun, so the tabs never show a day that has already passed.
 */
export function fieldWeekDates(): string[] {
  const { iso, weekdayIso } = laToday();
  const [y, m, d] = iso.split("-").map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() + (weekdayIso <= 4 ? -(weekdayIso - 1) : 8 - weekdayIso));
  return Array.from({ length: 4 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

/** Today if it's one of the four tabs, else the first tab with stops in it,
    else Monday. Never a day with nothing to show and nothing to plan. */
export function defaultActiveDay(byDay: Record<string, unknown[] | undefined>, days: string[]): string {
  const { iso } = laToday();
  if (days.includes(iso)) return iso;
  return days.find((d) => (byDay[d]?.length ?? 0) > 0) ?? days[0];
}
