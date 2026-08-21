"use server";

import { revalidatePath } from "next/cache";
import {
  sanitizeRouteEndpoint,
  setRouteDraft,
  setRouteSchedulePrefs,
  setShowChainAccounts,
  setShowPracticeAccounts,
  type RouteDraftEntry,
  type RouteSchedulePrefs,
} from "./dal";

/** The map's "chains" button. Persists to nb_ui_prefs (see migration 0024)
 * rather than client state, so the undo Juan asked to be semi-permanent
 * actually survives a reload and follows him to his other device. */
export async function toggleShowChainAccounts(show: boolean): Promise<void> {
  await setShowChainAccounts(show);
  revalidatePath("/nutribiotic/map");
}

/** Same as toggleShowChainAccounts, for the map's "practices" button
 * (single-practitioner offices, channel = 'clinic'). See migration 0025. */
export async function toggleShowPracticeAccounts(show: boolean): Promise<void> {
  await setShowPracticeAccounts(show);
  revalidatePath("/nutribiotic/map");
}

/**
 * Save the hand-built route (migration 0029). The whole ordered list every
 * time, because that is what an add / reorder / remove each produce and it
 * keeps the client and the row from ever disagreeing about position.
 *
 * DELIBERATELY NO revalidatePath. The route panel is optimistic: the click
 * already moved the stop on screen, and re-rendering the server component
 * would throw the map's pan, zoom and open InfoWindow away every time Juan
 * nudged a stop. The row is the durable copy, the screen is already right.
 */
export async function saveRouteDraft(entries: RouteDraftEntry[]): Promise<void> {
  await setRouteDraft(entries);
}

/**
 * Departure, dwell, lunch and the home-by target (migration 0037). Persisted
 * for the same reason the route itself is: a day set up at the kitchen table
 * has to still be the day when the phone comes out in the car.
 *
 * Clamped here rather than trusted from the client, because the column
 * constraint would reject a bad value with a 400 the panel would have to
 * explain, and the honest fix for "he typed 900" is 240, not an error dialog.
 * No revalidatePath, same reason as saveRouteDraft.
 */
export async function saveRouteSchedulePrefs(p: RouteSchedulePrefs): Promise<void> {
  const clamp = (n: number, lo: number, hi: number, fallback: number) =>
    Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
  const time = (t: string | null, fallback: string | null) =>
    t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : fallback;

  await setRouteSchedulePrefs({
    depart: time(p.depart, "09:30")!,
    dwellMinutes: clamp(p.dwellMinutes, 1, 240, 20),
    lunchMinutes: clamp(p.lunchMinutes, 0, 240, 60),
    returnBy: time(p.returnBy, null),
    // Re-validated rather than trusted, same as route_draft's custom stops:
    // this crossed the network as JSON once already and a malformed shape
    // here should fall back to the waypoint default, not get written as-is.
    start: sanitizeRouteEndpoint(p.start),
    end: sanitizeRouteEndpoint(p.end),
  });
}
