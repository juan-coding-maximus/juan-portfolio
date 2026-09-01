"use server";

import { revalidatePath } from "next/cache";
import {
  sanitizeRouteEndpoint,
  setLastLocation,
  setRouteCalls,
  setRouteDone,
  setRouteDraft,
  setRouteEndByDay,
  setRouteSchedulePrefs,
  setRouteStartByDay,
  setShowChainAccounts,
  setShowPracticeAccounts,
  type RouteCallsByDay,
  type RouteDoneByDay,
  type RouteDraftByDay,
  type RouteEndpointsByDay,
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
 * Save the hand-built route (migration 0029), day-partitioned since
 * 2026-08-23. The whole object every time, every day at once, because that is
 * what an add / reorder / remove / postpone each produce and it keeps the
 * client and the row from ever disagreeing about position.
 *
 * DELIBERATELY NO revalidatePath. The route panel is optimistic: the click
 * already moved the stop on screen, and re-rendering the server component
 * would throw the map's pan, zoom and open InfoWindow away every time Juan
 * nudged a stop. The row is the durable copy, the screen is already right.
 */
export async function saveRouteDraft(byDay: RouteDraftByDay): Promise<void> {
  await setRouteDraft(byDay);
}

/**
 * The route's call list (migration 0041), day-partitioned and independent of
 * route_draft, same optimistic contract as saveRouteDraft: the click already
 * moved the list on screen, this just makes it durable. No revalidatePath,
 * same reason as saveRouteDraft.
 */
export async function saveRouteCalls(byDay: RouteCallsByDay): Promise<void> {
  await setRouteCalls(byDay);
}

/**
 * Stops marked done (migration 0042), same optimistic contract as
 * saveRouteDraft/saveRouteCalls: the tap already crossed the stop off on
 * screen, this makes it durable and lets the widget pick it up. No
 * revalidatePath, same reason as saveRouteDraft.
 */
export async function saveRouteDone(byDay: RouteDoneByDay): Promise<void> {
  await setRouteDone(byDay);
}

/**
 * MapScreen's own half of the last-known-location write (migration 0044,
 * Juan's ask 2026-08-27): the SAME geolocation fix requestLoc() already asks
 * for every time /nutribiotic/map opens, now also saved so the widget can
 * price its finish-time estimate off Juan's real position instead of a
 * last-done-stop proxy. Fire-and-forget from the caller's side, same as
 * every other optimistic write here -- the map already has its fix and
 * doesn't need to wait on this to keep working.
 *
 * No longer auto-completes a stop (Juan, 2026-08-31, geolocation-based
 * auto-done faded completely -- see setLastLocation in dal.ts). The HubSpot-
 * filing trigger (markRouteStopDoneForAccountToday) is the only one left.
 */
export async function reportLiveLocation(lat: number, lng: number): Promise<void> {
  await setLastLocation(lat, lng);
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
  });
}

/**
 * Route start/end overrides, day-partitioned same as route_draft
 * (2026-08-23). Each entry is re-validated rather than trusted, same as
 * route_draft's custom stops: this crossed the network as JSON once already,
 * and a malformed entry here should drop out of the map (falling back to the
 * chain default, see MapScreen's startFallback) rather than get written as-is.
 * No revalidatePath, same reason as saveRouteDraft.
 */
export async function saveRouteStartByDay(byDay: RouteEndpointsByDay): Promise<void> {
  await setRouteStartByDay(sanitizeEndpointsByDay(byDay));
}

export async function saveRouteEndByDay(byDay: RouteEndpointsByDay): Promise<void> {
  await setRouteEndByDay(sanitizeEndpointsByDay(byDay));
}

function sanitizeEndpointsByDay(byDay: RouteEndpointsByDay): RouteEndpointsByDay {
  const out: RouteEndpointsByDay = {};
  for (const [day, ep] of Object.entries(byDay)) {
    const clean = sanitizeRouteEndpoint(ep);
    if (clean) out[day] = clean;
  }
  return out;
}
