"use client";

/**
 * The map screen: one owner for the phone's position, shared by the two things
 * that need it, the map (open centred on Juan, kinda zoomed in) and the
 * ten-closest list below it. Position is asked for once on mount and never
 * stored anywhere: it exists in this component's state for this page view and
 * that is all. A denied or absent fix degrades honestly, the map falls back to
 * fitting the territory and the list says why it is empty instead of guessing
 * a location. "Honestly" includes naming the right cause: see requestLoc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CustomStop,
  MapAccount,
  RouteEndpoint,
  RouteEndpointsByDay,
  RouteSchedulePrefs,
  TerritoryArea,
} from "../lib/dal";
import { fullAddress } from "../lib/ui";
import {
  reportLiveLocation,
  saveRouteEndByDay,
  saveRouteSchedulePrefs,
  saveRouteStartByDay,
  toggleShowChainAccounts,
  toggleShowPracticeAccounts,
} from "../lib/prefs-actions";
import { useRoute } from "../lib/route-context";
import { AccountsMap } from "./AccountsMap";
import { routeDriveMatrix, type DriveLeg } from "./drive-actions";
import { cheapestGap, haversineMatrix, optimizedStopOrder, type Matrix } from "./route-optimize";
import { RoutePanel } from "./RoutePanel";

export type UserLoc = { lat: number; lng: number };
export type FocusRequest = { id: string; n: number };

/**
 * A resolved position on the route. Coordinates sit at the top level on both
 * arms so the leg maths and the Maps links never branch: what differs between
 * an account and a lunch stop is what the card SAYS, not where it is.
 */
export type RouteStopView = { id: string; lat: number; lng: number } & (
  | { type: "account"; account: MapAccount }
  | { type: "custom"; custom: CustomStop }
);

export function MapScreen({
  accounts,
  areas,
  initialShowChains,
  initialShowPractices,
  schedulePrefs,
  endpointsByDay,
}: {
  accounts: MapAccount[];
  areas: TerritoryArea[];
  initialShowChains: boolean;
  initialShowPractices: boolean;
  schedulePrefs: RouteSchedulePrefs;
  endpointsByDay: { start: RouteEndpointsByDay; end: RouteEndpointsByDay };
}) {
  const [loc, setLoc] = useState<UserLoc | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const focusN = useRef(0);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  // Server-persisted (nb_ui_prefs, migration 0024/0025), not component state
  // that resets on reload: Juan asked for the undo to be semi-permanent same
  // as the exclusion itself. Optimistic locally, reverted if the write fails.
  const [showChains, setShowChains] = useState(initialShowChains);
  function toggleChains() {
    const next = !showChains;
    setShowChains(next);
    toggleShowChainAccounts(next).catch(() => setShowChains(!next));
  }

  const [showPractices, setShowPractices] = useState(initialShowPractices);
  function togglePractices() {
    const next = !showPractices;
    setShowPractices(next);
    toggleShowPracticeAccounts(next).catch(() => setShowPractices(!next));
  }

  /* THE HAND-BUILT ROUTE (0029), lifted to app-wide state in route-context.tsx
     2026-08-11 so the same "Add to route" action also works from an account's
     profile, not only from a map pin's card. Ids, not account objects, because
     the ids are what the row stores and resolving them against `accounts` on
     every render means a stop that gets closed or leaves Juan's book simply
     stops being a stop, rather than sitting there as an unclickable blank. */
  const {
    routeDraft,
    inRoute,
    days,
    activeDay,
    setActiveDay,
    addToRoute,
    addCustomStop,
    removeFromRoute,
    moveInRoute,
    moveToTop,
    reorderRoute,
    moveStopToDay,
    clearRoute,
    calls,
    addCall,
    removeCall,
    moveCallToDay,
    done,
    toggleDone,
  } = useRoute();

  /* An account entry that no longer resolves drops out here (see getRouteDraft);
     a custom stop cannot drop out, because it carries everything it needs. */
  const routeStops = useMemo<RouteStopView[]>(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return routeDraft
      .map((e): RouteStopView | null => {
        if (typeof e !== "string") {
          return { id: e.id, lat: e.lat, lng: e.lng, type: "custom", custom: e };
        }
        const a = byId.get(e);
        return a ? { id: a.id, lat: a.lat, lng: a.lng, type: "account", account: a } : null;
      })
      .filter((s): s is RouteStopView => s !== null);
  }, [routeDraft, accounts]);

  // Drawn on the map as well as listed: a lunch stop between two clusters is
  // only useful if you can see where it falls in the day.
  const customStops = useMemo(
    () => routeStops.filter((s) => s.type === "custom").map((s) => s.custom),
    [routeStops],
  );

  /* Where the driving starts and ends BY DEFAULT. The waypoint account is
     Juan's apartment (migration 0029), identified by lifecycle rather than by
     its id so this keeps working if the home base ever moves to a different
     row. It is deliberately NOT a stop: it takes no time and nothing is sold
     there, it is just the two ends of the day the route panel measures
     against -- unless overridden below. */
  const home = useMemo<RouteEndpoint | null>(() => {
    const w = accounts.find((a) => a.lifecycle === "waypoint");
    if (!w) return null;
    return { label: "Home", address: fullAddress(w) ?? w.name, lat: w.lat, lng: w.lng };
  }, [accounts]);

  /* THE SCHEDULE PREFS (depart/dwell/lunch/return-by, migration 0037), lifted
     here rather than left inside RoutePanel: AccountsMap's route-chain toggle
     needs the SAME live prefs RoutePanel is showing, including an edit Juan
     just made and hasn't reloaded to see, so both have to read one piece of
     state rather than the map re-deriving its own copy. Optimistic, like
     every other write on this screen. Global across the field week (unlike
     start/end below) -- when he leaves and how long a door takes doesn't vary
     by day the way where he sleeps does. */
  const [prefs, setPrefsState] = useState<RouteSchedulePrefs>(schedulePrefs);
  function editPrefs(next: RouteSchedulePrefs) {
    const prev = prefs;
    setPrefsState(next);
    saveRouteSchedulePrefs(next).catch(() => setPrefsState(prev));
  }

  /* START/END OVERRIDES (0040), DAY-PARTITIONED alongside route_draft
     (2026-08-23): each field day keeps its own end rather than one pair
     shared by the whole week, which is what makes a real multi-day run (drive
     out Monday, sleep at the cluster, drive home Wednesday) expressible at
     all -- a single shared override could never have Monday end at a hotel
     while Thursday ends at home.
     `startByDay` only ever holds an entry for the FIRST day on the horizon
     now (2026-08-24): every later day's start IS the previous day's end, the
     same physical fact -- where Juan slept -- not a second copy of it that
     could quietly disagree. See editStart below. */
  const [startByDay, setStartByDay] = useState<RouteEndpointsByDay>(endpointsByDay.start);
  const [endByDay, setEndByDay] = useState<RouteEndpointsByDay>(() => {
    // One-time fold (2026-08-24): a start override on a day after the first,
    // from just before start/end shared one fact, becomes THAT DAY'S
    // PREVIOUS DAY's end -- the same physical location, read from the other
    // side. Only fills a gap; never overwrites an end Juan already set.
    const merged = { ...endpointsByDay.end };
    days.forEach((day, i) => {
      if (i === 0) return;
      const legacyStart = endpointsByDay.start[day];
      const prev = days[i - 1];
      if (legacyStart && !merged[prev]) merged[prev] = legacyStart;
    });
    return merged;
  });

  const dayIndex = days.indexOf(activeDay);
  const prevDay = dayIndex > 0 ? days[dayIndex - 1] : null;

  // The first day on the horizon has no previous day to share a start with,
  // so it keeps its own independent override. Every later day's start reads
  // straight off the previous day's end -- there is nothing separate to read.
  const activeStart = prevDay ? (endByDay[prevDay] ?? null) : (startByDay[activeDay] ?? null);
  const activeEnd = endByDay[activeDay] ?? null;
  const startFallback = prevDay ? (endByDay[prevDay] ?? home) : home;

  function setEndForDay(day: string, ep: RouteEndpoint | null) {
    const prev = endByDay;
    const next = { ...endByDay };
    if (ep) next[day] = ep;
    else delete next[day];
    setEndByDay(next);
    saveRouteEndByDay(next).catch(() => setEndByDay(prev));
  }

  function editEnd(ep: RouteEndpoint | null) {
    setEndForDay(activeDay, ep);
  }

  // AUTO-SYNCED TO THE PREVIOUS DAY (Juan's ask 2026-08-24): "where today
  // starts" and "where yesterday ended" are the same fact, so this writes the
  // previous day's end, not a separate start for today. Picking Home here
  // freezes the previous day's end AT home explicitly -- "I actually drove
  // all the way back before starting today" -- same as everywhere else on
  // this screen, home is the lowest-priority default, never a value that
  // silently wins over something Juan actually picked. Only the first day on
  // the horizon, with no previous day, keeps its own independent override.
  function editStart(ep: RouteEndpoint | null) {
    if (prevDay) {
      setEndForDay(prevDay, ep);
      return;
    }
    const prev = startByDay;
    const next = { ...startByDay };
    if (ep) next[activeDay] = ep;
    else delete next[activeDay];
    setStartByDay(next);
    saveRouteStartByDay(next).catch(() => setStartByDay(prev));
  }

  // What the day actually starts/ends at: Juan's override if he picked one
  // (see RouteEndpointField), else the chain default for start / the waypoint
  // for end. Independent of each other -- a run can leave home and end at a
  // hotel, or the reverse.
  const routeStart = activeStart ?? startFallback;
  const routeEnd = activeEnd ?? home;

  /* SMART INSERT AND OPTIMIZE (2026-08-23, route-optimize.ts). Both need a
     distance matrix over the active day's stops, which only this screen has
     resolved coordinates for (routeStops). The real road matrix first (OSRM's
     /table via routeDriveMatrix), straight-line if that fails -- same honesty
     split as every other drive number on this screen, just never left blank:
     an add or an optimize still has to land somewhere, so the fallback is a
     worse answer, not a stalled button. */
  const [routeBusy, setRouteBusy] = useState(false);

  /* The legs RoutePanel is displaying, published upward so AccountsMap can
     draw the SAME day the list describes. One computation, two readers: the
     alternative is a second OSRM call and a second traffic pass whose answer
     is free to disagree with the one on screen beside it. */
  const [routeLegs, setRouteLegs] = useState<DriveLeg[] | null>(null);

  async function costMatrix(points: { lat: number; lng: number }[]): Promise<Matrix> {
    const live = await routeDriveMatrix(points).catch(() => null);
    return live ?? haversineMatrix(points);
  }

  async function handleAddToRoute(id: string, lat: number, lng: number) {
    if (inRoute.has(id)) return;
    if (routeStops.length === 0) {
      addToRoute(id);
      return;
    }
    setRouteBusy(true);
    try {
      const points = [
        ...(routeStart ? [routeStart] : []),
        ...routeStops,
        ...(routeEnd ? [routeEnd] : []),
        { lat, lng },
      ];
      const matrix = await costMatrix(points);
      const gap = cheapestGap(matrix, routeStops.length, routeStart !== null, routeEnd !== null);
      addToRoute(id, gap);
    } catch {
      addToRoute(id);
    } finally {
      setRouteBusy(false);
    }
  }

  async function handleAddCustomStop(stop: Omit<CustomStop, "id">) {
    if (routeStops.length === 0) {
      addCustomStop(stop);
      return;
    }
    setRouteBusy(true);
    try {
      const points = [
        ...(routeStart ? [routeStart] : []),
        ...routeStops,
        ...(routeEnd ? [routeEnd] : []),
        { lat: stop.lat, lng: stop.lng },
      ];
      const matrix = await costMatrix(points);
      const gap = cheapestGap(matrix, routeStops.length, routeStart !== null, routeEnd !== null);
      addCustomStop(stop, gap);
    } catch {
      addCustomStop(stop);
    } finally {
      setRouteBusy(false);
    }
  }

  // The graph-theory ask (Juan, 2026-08-23): the order that makes the day's
  // total driving shortest, start and end pinned wherever they're real.
  // Nothing below two stops to reorder, so the button that calls this stays
  // disabled under three.
  async function handleOptimizeRoute() {
    if (routeStops.length < 3) return;
    setRouteBusy(true);
    try {
      const points = [...(routeStart ? [routeStart] : []), ...routeStops, ...(routeEnd ? [routeEnd] : [])];
      const matrix = await costMatrix(points);
      const order = optimizedStopOrder(matrix, routeStops.length, routeStart !== null, routeEnd !== null);
      reorderRoute(order.map((i) => routeStops[i].id));
    } catch {
      // Optimize is opt-in and all-or-nothing: a failure here leaves the
      // order exactly as it was rather than applying half a result.
    } finally {
      setRouteBusy(false);
    }
  }

  // A fresh n on every click, even a repeat click on the same account, so the
  // map's focus effect (keyed on this signal) always re-fires and re-zooms
  // rather than no-op'ing on an unchanged id.
  function showInMap(id: string) {
    focusN.current += 1;
    setFocus({ id, n: focusN.current });
    // Only worth scrolling when the map is somewhere else on the page. In the
    // two-pane layout it is already beside the list that was just tapped, and
    // yanking the page to the top would move the row out from under the
    // cursor for no gain.
    const box = mapBoxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const alreadyVisible = r.top >= 0 && r.bottom <= window.innerHeight;
    if (!alreadyVisible) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Ask for the fix. Callable again from the list's retry button, because the
  // two failures that actually happen here are both recoverable without a
  // reload: an unanswered permission bubble, and a Mac that took its time.
  //
  // Three things this gets right that the first version did not, all of them
  // learned from the map telling Juan on his Mac that he had denied a
  // permission the browser reported as "prompt":
  //
  // 1. A failure is not automatically a denial. GeolocationPositionError has
  //    three codes and they mean different things to the person reading the
  //    screen: only PERMISSION_DENIED is a permission to go change.
  // 2. getCurrentPosition's timeout starts at the call, not when the user
  //    answers the bubble, so a 10s cap was a countdown against Juan reading
  //    a dialog rather than against the radio getting a fix. It expired with
  //    the bubble still open. The cap is long while an answer is outstanding
  //    and short once the grant is already on file.
  // 3. enableHighAccuracy is a phone idea. A Mac has no GPS to switch on, so
  //    the flag only makes Core Location work longer for the same wifi-derived
  //    answer, which is the other half of why this timed out. A city-block fix
  //    is all a "who is near me" ranking can honestly use anyway.
  const requestLoc = useCallback(() => {
    if (!("geolocation" in navigator)) return;

    const ask = (answerPending: boolean) =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
        },
        () => {
          // A denied/timed-out fix degrades honestly: the map falls back to
          // fitting the territory instead of centring on a location it doesn't
          // have. Nothing else on this screen depends on knowing why.
        },
        {
          enableHighAccuracy: false,
          timeout: answerPending ? 60_000 : 15_000,
          maximumAge: 60_000,
        },
      );

    // Permissions API is advisory here: if it is missing or refuses the query
    // (Safari does not expose geolocation state), assume an answer is pending
    // and take the patient timeout. Being slow to give up is the safe error.
    const perms = navigator.permissions;
    if (perms?.query) {
      perms
        .query({ name: "geolocation" })
        .then((s) => ask(s.state === "prompt"))
        .catch(() => ask(true));
    } else {
      ask(true);
    }
  }, []);

  useEffect(() => {
    requestLoc();
  }, [requestLoc]);

  /* Re-asks for a fix every 2 minutes while this tab is actually visible
   * (Juan's ask 2026-08-31: he wants the dwell-based auto-done -- see
   * setLastLocationAndAutoComplete's route_dwell -- to actually accumulate
   * its 10 minutes while the map is open on the dash mount or in his hand,
   * not sit on a single load-time fix. This is still NOT true OS background
   * tracking: a locked phone or a closed tab gets nothing, same limitation
   * 0052's migration header already calls out. That gap is what the HubSpot-
   * filing trigger (maybeMarkStopServiced, touchpoint.ts) exists to cover. */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") requestLoc();
    }, 120_000);
    return () => clearInterval(id);
  }, [requestLoc]);

  /* THE ONLY PLACE THIS APP REPORTS A LIVE LOCATION (Juan's ask 2026-08-27):
   * riding on the geolocation fix requestLoc() already asks for, never a
   * separate poll of its own. Runs on `loc` rather than inside requestLoc's
   * own success callback so it always closes over the CURRENT done/toggleDone
   * from this render, not whichever ones existed when requestLoc was first
   * memoized. Feeds the widget's live finish-time estimate (last_location,
   * migration 0044) and the dwell-based auto-done check (0.2mi for 10
   * continuous minutes, route_dwell, migration 0052) -- occasional false
   * positives are fine by design (Juan, 2026-08-31), same one-tap-to-undo
   * cost as any other done mark. */
  useEffect(() => {
    if (!loc) return;
    reportLiveLocation(loc.lat, loc.lng)
      .then((res) => {
        for (const id of res.autoDoneIds) toggleDone(id);
      })
      .catch(() => {
        // A location report is a nice-to-have, not a dependency: the map
        // already has its fix and keeps working regardless.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);

  return (
    /**
     * TWO PANES FROM TABLET UP, ONE COLUMN ON A PHONE (Juan, 2026-08-26;
     * breakpoint moved 2026-08-30).
     *
     * The map and the route are read against each other constantly: a pin is
     * only interesting because of where it falls in the day, and a stop's
     * position is only judgeable against the map. Stacked, one of them was
     * always off screen while he reasoned about the other, and the answer was
     * a scroll every few seconds. Side by side they carry the same weight,
     * which is what they actually have.
     *
     * The split triggers at md, the SAME breakpoint the sidebar disappears at
     * (layout.tsx's aside/MobileNav moved from md to 2xl on 2026-08-30 for
     * exactly this reason): two panes need width, and the sidebar was the
     * biggest single thing standing between them and it. Below md this is
     * exactly the screen it was, because on a phone a half-width map is not a
     * map. From md to 2xl there is no sidebar competing for room, only the
     * bottom tab bar; from 2xl up the sidebar returns and both panes keep
     * growing inside it. The columns are NOT an even split -- grid-cols-2
     * would hand the route panel the same width as the map, and the route's
     * own content (a stop's action-button row, RoutePanel.tsx) needs less of
     * it than the map does to stay legible. 3fr:2fr (~60/40) gives the map
     * the larger share throughout, so it reads as "the map, with a route
     * beside it" at every width instead of two equal boxes.
     *
     * The left pane is sticky and viewport-tall; the right scrolls on its own.
     * The ten-closest joins the right column rather than sitting under the
     * grid: left is where things are, right is every list.
     */
    <div className="md:grid md:grid-cols-[3fr_2fr] md:items-start md:gap-4 lg:gap-5">
      {/* THE FILTER ROWS LIVE INSIDE THIS BOX, so its height is not the map's
          height: the area and tier rows take ~128px off the top. At a 420px
          floor that left the map 292px tall, and fitBounds correctly solved for
          a zoom that fits 500km of California into 292px, which is why the map
          once opened showing Nevada and Texas. The floor has to clear the
          chrome before it is a map; on a phone the rows wrap taller, hence the
          smaller floor there paired with the ten-closest list right below. */}
      <div
        ref={mapBoxRef}
        className="h-[calc(100vh-240px)] min-h-[420px] overflow-hidden rounded-lg border border-[#E2DFD5] md:min-h-[380px] md:sticky md:top-7 md:h-[calc(100vh-56px)]"
      >
        <AccountsMap
          accounts={accounts}
          areas={areas}
          userLoc={loc}
          focus={focus}
          showChains={showChains}
          onToggleShowChains={toggleChains}
          showPractices={showPractices}
          onToggleShowPractices={togglePractices}
          onAddToRoute={handleAddToRoute}
          inRoute={inRoute}
          customStops={customStops}
          routeStops={routeStops}
          routeStart={routeStart}
          routeEnd={routeEnd}
          routeLegs={routeLegs}
        />
      </div>

      {/* Stacked below the map on a phone, beside it from md up. min-w-0 is
          load-bearing (2026-08-30): a grid item's default min-width is its
          content's, not the track's, so without this RoutePanel's own
          content (a stop's fixed-width action-button row, notably) could
          refuse to shrink below its intrinsic width and force the grid
          track wider than its 2fr share -- which, with globals.css clipping
          horizontal overflow instead of scrolling it, made the whole column
          silently vanish off the right edge at exactly the widths this
          split exists to serve. The wrapper is the right column; it carries
          its own flow so RoutePanel keeps returning a fragment and nothing
          inside it had to change. */}
      <div className="mt-8 flex min-w-0 flex-col gap-8 md:mt-0">
      <RoutePanel
        stops={routeStops}
        home={home}
        prefs={prefs}
        onChangePrefs={editPrefs}
        start={activeStart}
        startFallback={startFallback}
        end={activeEnd}
        onChangeStart={editStart}
        onChangeEnd={editEnd}
        onMove={moveInRoute}
        onMoveToTop={moveToTop}
        onReorder={reorderRoute}
        onRemove={removeFromRoute}
        onClear={clearRoute}
        onShowInMap={showInMap}
        onAddCustomStop={handleAddCustomStop}
        calls={calls}
        onAddCall={addCall}
        onRemoveCall={removeCall}
        onMoveCallDay={moveCallToDay}
        done={done}
        onToggleDone={toggleDone}
        days={days}
        activeDay={activeDay}
        onSelectDay={setActiveDay}
        onMoveStopDay={moveStopToDay}
        onOptimize={handleOptimizeRoute}
        busy={routeBusy}
        onLegsChange={setRouteLegs}
      />
      </div>
    </div>
  );
}
