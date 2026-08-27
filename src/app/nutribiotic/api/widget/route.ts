/**
 * The route, as one JSON snapshot a home-screen widget can render.
 *
 * WHY AN ENDPOINT AND NOT A SCRAPE. A widget has no cookie jar and no DOM, so
 * the only honest way to put today's route on the Lock Screen is a small,
 * purpose-shaped payload the widget draws itself. This returns exactly what
 * RoutePanel shows and nothing more: the same stops, the same order, the same
 * trading facts, the same straight-line legs.
 *
 * IT IS A MIRROR, NOT A SECOND SOURCE. The order is Juan's hand-built draft
 * (nb_ui_prefs.route_draft, migration 0029) resolved against the same
 * listOwnerAccounts() the map uses, so an account that closes or leaves his
 * book drops out of the widget the same turn it drops off the map. Nothing here
 * recomputes, reorders, or optimizes anything.
 *
 * ONE DAY, DAY-PARTITIONED since 2026-08-23: ?day=YYYY-MM-DD picks which day
 * on the rolling ten-weekday horizon to render (see field-week.ts), defaulting
 * the same way the route panel does (today if it's on the horizon, else the
 * first day on it with stops in it). The response says which day it picked,
 * so the widget never shows a route without saying whose.
 *
 * NO DRIVE TIME, NO ETA. Same rule as the panel: there is no Directions call
 * behind this, so the one number per leg is the straight-line hop, labelled as
 * such in the payload's own field name.
 *
 * Bearer-gated on NB_WIDGET_TOKEN, its OWN secret rather than the
 * NB_SESSION_SECRET the Mac bridges use. That secret signs the session cookie,
 * so a copy of it sitting in a script on a phone would be a session-minting
 * key left in a pocket. This one grants exactly one read and can be rotated in
 * Vercel without logging Juan out of anything. Sent as a header, never a query
 * string, so it stays out of URLs and access logs.
 */
import {
  defaultActiveDay,
  planningHorizonDates,
  getLastLocation,
  getRouteMileageByDay,
  getRouteStateByDay,
  getRouteSchedulePrefs,
  listOwnerAccounts,
  type CustomStop,
  type MapAccount,
} from "../../lib/dal";
import { hasAccess } from "../../lib/devices";
import { hasWidgetToken } from "../../lib/session";
import { likelyDriveMinutes } from "../../map/traffic";
import { appleMapsUrl, fullAddress, HUBSPOT_COMPANY_URL } from "../../lib/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://juanarenas.bio";

/** Wall-clock minutes since midnight, America/Los_Angeles, right now. Used to
 *  anchor the finish-time estimate to the actual moment the widget is being
 *  read, not to this morning's planned depart time (Juan's ask 2026-08-26). */
function nowMinutesLA(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Stop = {
  n: number;
  id: string;
  type: "account" | "custom";
  kind: CustomStop["kind"] | null;
  name: string;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  tier: MapAccount["tier"];
  phone: string | null;
  website: string | null;
  hubspot_url: string | null;
  last_order_at: string | null;
  trailing_12m_revenue: number | null;
  lifetime_revenue: number | null;
  top_category_12m: string | null;
  top_category_lifetime: string | null;
  /** Straight-line miles from the previous stop. Null on the first. */
  straight_line_miles_from_prev: number | null;
  /** Crossed off on /nutribiotic/map (migration 0042). Stays a stop -- the
   *  widget never drops a done stop, it just renders it done. */
  done: boolean;
  /* THE THREE THINGS A STOP IS FOR (Juan, 2026-08-14): drive to it, call it,
     read it. Each is a whole URL rather than a piece the widget assembles,
     because a deep link built in two places is a deep link that breaks in one
     of them. call_url and account_url are null when the fact is missing, and a
     null renders as no button, never as a dead one. */
  maps_url: string;
  call_url: string | null;
  account_url: string | null;
};

export async function GET(request: Request) {
  if (!(await hasWidgetToken()) && !(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const [routeState, accounts, prefs, mileageByDay, lastLocation] = await Promise.all([
    getRouteStateByDay(),
    listOwnerAccounts(),
    getRouteSchedulePrefs(),
    getRouteMileageByDay(),
    getLastLocation(),
  ]);
  const { draft: byDay, calls: callsByDay, done: doneByDay } = routeState;
  const byId = new Map(accounts.data.map((a) => [a.id, a]));

  const days = planningHorizonDates();
  const requested = new URL(request.url).searchParams.get("day");
  const day = requested && days.includes(requested) ? requested : defaultActiveDay(byDay, days);
  const draft = byDay[day] ?? [];
  const doneIds = new Set(doneByDay[day] ?? []);
  /* Calls (0041) are a separate, day-partitioned column, never mixed into
     route_draft: same mirror-not-second-source rule as the stops above, just
     over the other column. */
  const calls = (callsByDay[day] ?? []).map((c) => ({
    id: c.id,
    name: c.label,
    phone: c.phone,
    note: c.note ?? null,
    call_url: `tel:${c.phone.replace(/[^\d+]/g, "")}`,
    account_url: c.accountId ? `${SITE}/nutribiotic/account/${c.accountId}` : null,
  }));

  const stops: Stop[] = [];
  for (const e of draft) {
    if (typeof e !== "string") {
      stops.push({
        n: stops.length + 1,
        id: e.id,
        type: "custom",
        kind: e.kind,
        name: e.label,
        address: e.address,
        city: null,
        lat: e.lat,
        lng: e.lng,
        tier: null,
        phone: null,
        website: null,
        hubspot_url: null,
        last_order_at: null,
        trailing_12m_revenue: null,
        lifetime_revenue: null,
        top_category_12m: null,
        top_category_lifetime: null,
        straight_line_miles_from_prev: null,
        done: doneIds.has(e.id),
        /* A custom stop's address IS its identity (it was resolved from Places
           when it was added and then frozen), so it deep-links by address too. */
        maps_url: appleMapsUrl(e),
        call_url: null,
        account_url: null,
      });
      continue;
    }
    const a = byId.get(e);
    if (!a) continue; // the tombstone case, same as the map's
    stops.push({
      n: stops.length + 1,
      id: a.id,
      type: "account",
      kind: null,
      name: a.name,
      address: a.street,
      city: a.city,
      lat: a.lat,
      lng: a.lng,
      tier: a.tier,
      phone: a.phone,
      website: a.website,
      hubspot_url: a.hubspot_company_id ? HUBSPOT_COMPANY_URL(a.hubspot_company_id) : null,
      last_order_at: a.last_order_at,
      trailing_12m_revenue: a.trailing_12m_revenue,
      lifetime_revenue: a.lifetime_revenue,
      top_category_12m: a.top_category_12m,
      top_category_lifetime: a.top_category_lifetime,
      straight_line_miles_from_prev: null,
      done: doneIds.has(a.id),
      maps_url: appleMapsUrl({ address: fullAddress(a), lat: a.lat, lng: a.lng }),
      call_url: a.phone ? `tel:${a.phone.replace(/[^\d+]/g, "")}` : null,
      account_url: `${SITE}/nutribiotic/account/${a.id}`,
    });
  }

  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const miles = haversineMiles(stops[i - 1], stops[i]);
    stops[i].straight_line_miles_from_prev = Number(miles.toFixed(1));
    total += miles;
  }

  /**
   * A ROUGH, LIVE FINISH-TIME ESTIMATE (Juan's ask 2026-08-26: know what time
   * the route will be done, "right now, live"). Same honesty split as
   * everywhere else drive time appears in this OS: this endpoint deliberately
   * makes no Directions call (see the file header), so the FREE-FLOW minutes
   * per leg is still this endpoint's own circuity/speed guess (1.28x
   * straight-line, 42mph freeway-length legs, 21mph surface-length legs),
   * not the router-backed number RoutePanel shows on /nutribiotic/map. The
   * TIME-OF-DAY MULTIPLIER over that guess, though, is map/traffic.ts's real
   * curve (see below), the same one RoutePanel prices every leg with, so the
   * two screens never quote a different "back by" for the same day. Labelled
   * `rough` in the payload for the free-flow half of that honesty split; the
   * app's own clock is still the one to trust for anything that decides
   * whether a stop gets cut.
   *
   * LIVE, NOT THIS MORNING'S PLAN: once the day has visibly started (a stop
   * marked done, or a start odometer photo on file), the estimate anchors to
   * the ACTUAL current clock and drives from the LAST DONE STOP forward,
   * never from home at prefs.depart -- a route re-read at 2pm should say "3
   * more stops from here, back by X", not repeat the same 9:30-anchored
   * number it said at breakfast. Before the day starts, it still projects
   * from whichever is later, the planned depart or right now (a look-ahead
   * before leaving reads odd anchored to a depart time already in the past).
   *
   * ONE TRAFFIC SHAPE, NOT TWO (agency-3c, 2026-08-26): the free-flow number
   * per leg is still this endpoint's own straight-line/circuity guess -- no
   * Directions call, same reason as always -- but the multiplier over it is
   * map/traffic.ts's real time-of-day curve, the same one RoutePanel prices
   * every leg with. Two screens quoting two different "back by" times for
   * the same day is the actual failure mode this guards against, not
   * precision for its own sake.
   */
  const dayMileage = mileageByDay[day] ?? {};
  const home = accounts.data.find((a) => a.lifecycle === "waypoint");
  let schedule: { depart: string; finish_clock: string; over: boolean; return_by: string | null; live: boolean; rough: true } | null = null;
  if (home && stops.length > 0) {
    const CIRCUITY = 1.28;
    const FREEWAY_MPH = 42;
    const SURFACE_MPH = 21;
    const FREEWAY_MIN_MILES = 6;
    // Server runtime is UTC (Vercel), same trick lib/expenses.ts's parseDate
    // uses: build the synthetic instant from `day`'s own Y/M/D via UTC
    // fields, so trafficFactorAt's plain .getHours()/.getDay() read LA wall-
    // clock time regardless of the machine's real timezone.
    const [dy, dm2, dd] = day.split("-").map(Number);
    const dateAtMinutes = (mins: number): Date => {
      const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
      return new Date(Date.UTC(dy, dm2 - 1, dd, Math.floor(wrapped / 60), wrapped % 60));
    };
    const leg = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, departAtMinutes: number) => {
      const miles = haversineMiles(a, b) * CIRCUITY;
      const mph = miles >= FREEWAY_MIN_MILES ? FREEWAY_MPH : SURFACE_MPH;
      const freeFlow = (miles / mph) * 60;
      return Math.max(4, likelyDriveMinutes(freeFlow, dateAtMinutes(departAtMinutes)));
    };
    const [dh, dm] = prefs.depart.split(":").map(Number);
    const departMin = (Number.isFinite(dh) ? dh : 9) * 60 + (Number.isFinite(dm) ? dm : 30);
    const nowMin = nowMinutesLA();

    let lastDoneIdx = -1;
    stops.forEach((s, i) => {
      if (s.done) lastDoneIdx = i;
    });
    // Skipped, not sliced: a live fix can put Juan ahead of or beside where
    // his last done stop sits in the list, so "remaining" is every not-done
    // stop in order, independent of which one supplies the starting point.
    const remaining = stops.filter((s) => !s.done);

    /**
     * WHERE HE ACTUALLY IS (migration 0044, Juan's ask 2026-08-27). A fresh
     * last_location -- reported only from /nutribiotic/map's own geolocation
     * request or the widget's "tap to update" button, see dal.ts's
     * setLastLocationAndAutoComplete -- outranks the last-done-stop proxy
     * 0043 shipped with. LOCATION_FRESH_MINUTES bounds how old a fix this
     * endpoint will still trust: a fix from the kitchen table this morning
     * has no business pricing an afternoon leg, so a stale one is discarded
     * exactly like a missing one, falling back to the same proxy as before.
     */
    const LOCATION_FRESH_MINUTES = 90;
    const freshLocation =
      lastLocation && Date.now() - new Date(lastLocation.at).getTime() < LOCATION_FRESH_MINUTES * 60_000
        ? lastLocation
        : null;

    const startPos: { lat: number; lng: number } = freshLocation
      ? { lat: freshLocation.lat, lng: freshLocation.lng }
      : lastDoneIdx >= 0
        ? { lat: stops[lastDoneIdx].lat, lng: stops[lastDoneIdx].lng }
        : { lat: home.lat, lng: home.lng };
    const dayStarted = Boolean(freshLocation) || lastDoneIdx >= 0 || Boolean(dayMileage.start);

    let t = dayStarted ? nowMin : Math.max(departMin, nowMin);
    let pos = startPos;
    for (const s of remaining) {
      t += leg(pos, s, t);
      const dwell = s.kind === "lunch" ? prefs.lunchMinutes : s.kind === "hotel" ? 0 : prefs.dwellMinutes;
      t += dwell;
      pos = s;
    }
    t += leg(pos, home, t);
    const clock = (mins: number) => {
      const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
      return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
    };
    const returnByMin = prefs.returnBy ? (() => {
      const [rh, rm] = prefs.returnBy!.split(":").map(Number);
      return rh * 60 + rm;
    })() : null;
    schedule = {
      depart: prefs.depart,
      finish_clock: clock(t),
      over: returnByMin !== null && t > returnByMin,
      return_by: prefs.returnBy,
      live: dayStarted,
      rough: true,
    };
  }

  /**
   * CAMERA-GATED START/END MILEAGE (migration 0043, Juan's ask 2026-08-26):
   * not_started means the widget shows "record start mileage" instead of the
   * route; ready_to_end means every account stop today is crossed off, so
   * the widget prompts for the end photo on its own rather than waiting for
   * the manual End-route tap; ended is the brief moment right after an end
   * photo lands but before the pair has finished filing (see the mileage
   * route -- a successful file resets the day back to not_started, Juan's
   * own ask, so a second trip the same day starts clean).
   */
  const accountStops = stops.filter((s) => s.type === "account");
  const allAccountStopsDone = accountStops.length > 0 && accountStops.every((s) => s.done);
  const day_state: "not_started" | "in_progress" | "ready_to_end" | "ended" = !dayMileage.start
    ? "not_started"
    : dayMileage.end
      ? "ended"
      : allAccountStopsDone
        ? "ready_to_end"
        : "in_progress";

  return Response.json(
    {
      ok: true,
      generated_at: new Date().toISOString(),
      day,
      days,
      count: stops.length,
      stops,
      calls,
      schedule,
      day_state,
      mileage_error: dayMileage.fileError ?? null,
      total_straight_line_miles: stops.length > 1 ? Number(total.toFixed(1)) : null,
      maps_all_url:
        stops.length > 1
          ? `https://maps.apple.com/?daddr=${stops.map((s) => `${s.lat},${s.lng}`).join("+to:")}`
          : null,
      map_url: `${SITE}/nutribiotic/map`,
      visit_url: `${SITE}/nutribiotic/visit`,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
