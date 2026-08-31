"use client";

/**
 * The live territory map. Renders whatever listOwnerAccounts() returned at
 * request time, nothing cached or pre-baked, so a HubSpot pull + geocode run
 * shows up here on the next page load with no export/re-upload step.
 *
 * Google Maps JS API key is a NEXT_PUBLIC_ var: unlike the Supabase service
 * key (server-only, see dal.ts), this one is INTENDED to ship to the browser.
 * It is secured by HTTP-referrer restriction in the Cloud Console, not by
 * secrecy. See SETUP.md for how it was created.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, InfoWindowF, PolygonF, PolylineF, useLoadScript } from "@react-google-maps/api";
import type { CustomStop, MapAccount, TerritoryArea, Tier } from "../lib/dal";
import { listAreaBoundaries } from "../lib/area-actions";
import { AccountLink } from "../lib/modal";
import { appleMapsUrl, CUSTOM_STOP_LABEL, Ico, ReachLinks, realChannel } from "../lib/ui";
import type { DriveLeg } from "./drive-actions";
import type { FocusRequest, RouteStopView } from "./MapScreen";
import { BAND_STYLE, driveBand } from "./traffic";

/**
 * A red disc with a house cut into it: the two ends of the driving day.
 *
 * Inlined as a data URI rather than served from /public because the map draws
 * it the instant the route resolves, and a marker that pops in a beat late on
 * a screen Juan is scanning reads as a marker that was not there. It is also
 * the only asset on this map that is not drawn by the Maps API itself, so
 * having it carry no network dependency keeps the map's cold paint intact.
 *
 * White ring around the disc so it stays separable from a red area polygon or
 * a cluster of pins underneath it.
 */
const HOME_PIN_SVG =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="30" height="30">' +
      '<circle cx="15" cy="15" r="13" fill="#B23B3B" stroke="#FFFFFF" stroke-width="2.5"/>' +
      '<path d="M15 8.6 L21.4 14.2 L21.4 21.2 L17.6 21.2 L17.6 16.8 L12.4 16.8 L12.4 21.2 L8.6 21.2 L8.6 14.2 Z" ' +
      'fill="#FFFFFF"/>' +
      "</svg>",
  );


const CONTAINER_STYLE = { width: "100%", height: "100%" };

const TIERS: Tier[] = ["A", "B", "C", "D", "E", "F", "G"];

// Muted / desaturated, so the map reads as one system with the rest of the
// editorial UI rather than Google's default saturated red-blue-green.
const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f3f1ea" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a928c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f6f1" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d8d4c8" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f3f1ea" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ede9dc" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dde4e0" }] },
];

/* THE POTENTIAL DOTS, Juan's call 2026-08-04: an account carrying an HQ
   potential grade is the reason to be on this map at all, so those pins stop
   wearing their area colour and wear the grade instead.

   RAMP WIDENED 2026-08-05 on Juan's call, from two colours to four. C and D
   were sharing one orange while holding 112 accounts each, which is 224 pins,
   more than half the territory, rendered as one undifferentiated mass: the
   grade was on the chip but not in the eye. Now the ramp cools as capacity
   falls, red (A/B) to orange (C) to yellow (D) to grey (E), so the map reads
   hottest-first without reading a label. E is grey rather than a fifth hue on
   purpose: "personal use" is not a colder lead, it is a different thing, and
   grey says that where a paler yellow would just say "almost D".

   F and G keep their area dot, both being empty in this territory today; if
   they ever fill, they belong at the grey end with E rather than in a new hue.
   The same colours mark the filter chips, so the legend is the control. */
/* HubSpot's own Lead Status labels, read from the hs_lead_status property
   definition on 2026-08-05 (/crm/v3/properties/companies/hs_lead_status), not
   invented here. Kept as a value -> label map because HubSpot's stored value
   and its displayed label are NOT the same string for every option: 'No follow
   ups' is shown to a user as "Active - no follow ups". Filtering on the value
   and showing the label is the only way this menu matches the portal.

   An unrecognised value renders as itself rather than being dropped, so this
   map going stale degrades to slightly-wrong wording, never to a missing
   filter or a silently empty result. */
const LEAD_STATUS_LABEL: Record<string, string> = {
  "Active - follow ups": "Active - follow ups",
  "No follow ups": "Active - no follow ups",
  NEW: "New to open",
  Discarded: "Discarded",
  "To reactivate": "To reactivate",
};

// Sentinel for "HubSpot has no status on this company". A real filter choice,
// since 27 of Juan's accounts are in exactly that state and finding them is a
// reasonable thing to want; null would be indistinguishable from "no filter".
//
// Shown as "New to activate", Juan's name for the bucket on 2026-08-05: an
// account nobody has given a status is one nobody has started working. This is
// a LABEL ON THE NULL BUCKET, not a value: nothing is written to HubSpot, and
// "New to activate" is not one of hs_lead_status's six options (the nearest,
// 'NEW', displays as "New to open" and is a different, real, set status).
const NO_LEAD_STATUS = "__none__";
const NO_LEAD_STATUS_LABEL = "New to activate";

const POTENTIAL_COLOR: Partial<Record<Tier, string>> = {
  A: "#B5372A",
  B: "#B5372A",
  C: "#D97E2B",
  D: "#C79A1E",
  E: "#8A928C",
};

export function AccountsMap({
  accounts,
  areas,
  userLoc,
  focus,
  showChains,
  onToggleShowChains,
  showPractices,
  onToggleShowPractices,
  onAddToRoute,
  inRoute,
  customStops,
  routeStops,
  routeStart,
  routeLegs,
  routeEnd,
}: {
  accounts: MapAccount[];
  areas: TerritoryArea[];
  userLoc?: { lat: number; lng: number } | null;
  focus?: FocusRequest | null;
  /** Lunch / hotel / other stops on the hand-built route (2026-08-05). */
  customStops: CustomStop[];
  showChains: boolean;
  onToggleShowChains: () => void;
  showPractices: boolean;
  onToggleShowPractices: () => void;
  onAddToRoute: (id: string, lat: number, lng: number) => void;
  inRoute: Set<string>;
  /** The hand-built route, in Juan's order, same array RoutePanel numbers. */
  routeStops: RouteStopView[];
  /** Where the day starts/ends (0040): the waypoint by default, or whatever
      Juan picked in RoutePanel's start/end fields. Drawn as the chain's two
      ends when the route-line toggle is on; independent of each other. */
  routeStart: { lat: number; lng: number; label?: string } | null;
  routeEnd: { lat: number; lng: number; label?: string } | null;
  /** The route's legs, ALREADY PRICED at the hour each is driven, published by
      RoutePanel (see its onLegsChange). Same order and length as the chain's
      segments. Null while the router is in flight or unreachable, in which
      case no segment is labelled at all rather than labelled from a guess. */
  routeLegs: DriveLeg[] | null;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: apiKey ?? "" });
  const [selected, setSelected] = useState<MapAccount | null>(null);
  // A route stop that is not an account. Separate state from `selected` rather
  // than a union, because only one of the two can ever be open and the card
  // bodies share nothing: there is no grade, no order history, no portal record
  // behind a hotel.
  const [selectedStop, setSelectedStop] = useState<CustomStop | null>(null);
  // Empty set reads as "no filter", not "nothing matches" -- the default view
  // is every pin, same as the map before tiers existed on it.
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(new Set());
  // Same convention as the tier filter: empty means unfiltered, so a chip narrows
  // on click and widens again on the second click.
  const [activeAreas, setActiveAreas] = useState<Set<string>>(new Set());

  /* Empty set is unfiltered, same convention as the tier and area chips.
     Was a single-choice dropdown for a few hours on 2026-08-05; Juan asked for
     chips like the potential row instead, which also makes it multi-select,
     since a set of chips that only allowed one would be a radio group wearing
     the wrong clothes. "Active - follow ups OR New to activate" is a real
     question, and the dropdown could not ask it. */
  const [activeLeadStatuses, setActiveLeadStatuses] = useState<Set<string>>(new Set());

  // Closed by default: on a phone the map is what you came for. Desktop
  // ignores this entirely (md:contents), so the state is mobile-only.
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* THE ROUTE CHAIN, Juan's ask 2026-08-21: a toggle that draws the hand-built
     route as straight lines between the stops in the order he tapped them,
     each pin wearing that same order as a number. Off by default and not
     persisted -- this is a look-at-it-then-drop-it view of a route he is
     still assembling, not a display preference like showChains/showPractices.
     Straight lines on purpose, same honesty rule as the old ten-closest list:
     this map has no router, so a real driving path belongs to RoutePanel's
     drive-actions.ts leg times, not to a line here pretending to be one. */
  /* ON BY DEFAULT since 2026-08-26 (Juan: "routes are by default connected").
     The reason it started off no longer holds: this used to be a bare
     straight-line guess, and a guess drawn like a road is worse than no line.
     It now carries real per-leg drive time from the same computation the list
     beside it shows (see routeLegs), so the honest thing is to show it. */
  const [showRouteChain, setShowRouteChain] = useState(true);

  const routeNumberById = useMemo(() => {
    const m = new Map<string, number>();
    routeStops.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [routeStops]);

  /* Every point the day touches, in order, start and end included. This is the
     SAME sequence RoutePanel hands to the router, which is what lets leg i of
     routeLegs line up with segment i here without either side re-deriving it. */
  const chainPoints = useMemo(() => {
    if (!showRouteChain || routeStops.length === 0) return [];
    return [
      ...(routeStart ? [routeStart] : []),
      ...routeStops,
      ...(routeEnd ? [routeEnd] : []),
    ];
  }, [showRouteChain, routeStops, routeStart, routeEnd]);

  const chainPath = useMemo(
    () => chainPoints.map((p) => ({ lat: p.lat, lng: p.lng })),
    [chainPoints],
  );

  /**
   * THE LONG HAULS, drawn apart from the rest (Juan, 2026-08-26).
   *
   * A 45-minute-plus leg is not a hop between two neighbours, it is the
   * decision that splits a day into two clusters, and on a thin uniform line
   * it looked exactly like the six-minute leg next to it. These get a wide
   * grey band under the chain and carry their own minute count at the
   * midpoint, priced at the hour the leg is actually driven (traffic.ts) --
   * one likely number, not a spread.
   *
   * Empty until routeLegs lands. A segment is never labelled from
   * straight-line distance: an invented drive time on a map is the exact
   * failure the panel's honesty rules exist to prevent.
   */
  /* Start and end, deduplicated. A day that leaves home and returns home is one
     place, and stacking two identical markers on it just makes a heavier dot. */
  const endMarkers = useMemo(() => {
    if (!showRouteChain || routeStops.length === 0) return [];
    const ends = [
      { p: routeStart, role: "Start" },
      { p: routeEnd, role: "End" },
    ].filter((e): e is { p: { lat: number; lng: number; label?: string }; role: string } => e.p !== null);

    // Group by rounded position, then name each group by the roles that landed
    // on it: one place that is both ends reads "Start and end", not two marks.
    const byPlace = new Map<string, { lat: number; lng: number; roles: string[]; label: string }>();
    for (const { p, role } of ends) {
      const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      const found = byPlace.get(k);
      byPlace.set(k, {
        lat: p.lat,
        lng: p.lng,
        roles: [...(found?.roles ?? []), role],
        label: found?.label ?? p.label ?? "Home",
      });
    }

    return [...byPlace.entries()].map(([k, v]) => ({
      key: `end:${k}`,
      lat: v.lat,
      lng: v.lng,
      title: `${v.roles.length > 1 ? "Start and end" : v.roles[0]} · ${v.label}`,
    }));
  }, [showRouteChain, routeStops.length, routeStart, routeEnd]);

  /**
   * EVERY SEGMENT, BANDED BY WHAT IT COSTS (Juan, 2026-08-26).
   *
   * The chain used to be one uniform near-black line, which meant a
   * five-minute hop between two stores on the same block and a fifty-minute
   * run up the 405 were drawn identically. Those are opposite facts: the first
   * says park once and do both on foot, the second says this might be two
   * days. See traffic.ts's driveBand for the four bands and why these four.
   *
   * EMPTY UNTIL THE ROUTER ANSWERS, and that is the honesty rule this screen
   * has always had: a band is a claim about drive time, so with no drive time
   * there is no band. The fallback is the old single dark line, drawn
   * unbanded, rather than bands guessed from straight-line distance.
   */
  const chainSegments = useMemo(() => {
    if (!routeLegs || chainPoints.length < 2) return [];
    if (routeLegs.length !== chainPoints.length - 1) return [];
    return routeLegs.map((leg, i) => {
      const a = chainPoints[i];
      const b = chainPoints[i + 1];
      const minutes = Math.round(leg.minutes);
      return {
        key: `${i}:${a.lat},${a.lng}->${b.lat},${b.lng}`,
        path: [
          { lat: a.lat, lng: a.lng },
          { lat: b.lat, lng: b.lng },
        ] as google.maps.LatLngLiteral[],
        mid: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 },
        minutes,
        band: driveBand(minutes),
      };
    });
  }, [routeLegs, chainPoints]);

  function toggleLeadStatus(v: string) {
    setSelected(null);
    setActiveLeadStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }
  const mapRef = useRef<google.maps.Map | null>(null);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  /* THE FRONTIERS. Each area's boundary was derived from the assignment by Voronoi
     dissolve (assign_areas.py), so the fill under a pin is always that pin's own area
     and the regions tile with no gaps. Drawn UNDER the markers, at low opacity, with
     a stronger stroke: the point is to read the division at a glance, not to compete
     with the pins for attention.

     clickable is off. A polygon covering half the state would otherwise swallow every
     click meant for a marker sitting on top of it. */
  /**
   * THE FRONTIER POLYGONS, FETCHED ON DEMAND (2026-08-26).
   *
   * listAreas() stopped selecting `boundary`: unsimplified MultiPolygons for
   * 14 areas were the heaviest thing in this screen's payload, re-serialized on
   * every load of a force-dynamic page, to draw an outline Juan said is not
   * important and changes as the territory moves. They now load the first time
   * he actually picks an area, once per page view, and the chips work with or
   * without them.
   *
   * A failure here draws no frontier and nothing else: the chips still filter
   * pins, which is what the chips are for.
   */
  const [boundaries, setBoundaries] = useState<Map<string, TerritoryArea["boundary"]> | null>(null);
  const boundaryAsked = useRef(false);

  useEffect(() => {
    if (activeAreas.size === 0 || boundaryAsked.current) return;
    boundaryAsked.current = true;
    let live = true;
    listAreaBoundaries()
      .then((rows) => {
        if (live) setBoundaries(new Map(rows.map((r) => [r.id, r.boundary])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [activeAreas.size]);

  const shownAreas = useMemo(() => {
    if (activeAreas.size === 0 || !boundaries) return [];
    return areas
      .filter((a) => activeAreas.has(a.id))
      .map((a) => ({ ...a, boundary: a.boundary ?? boundaries.get(a.id) ?? null }))
      .filter((a) => a.boundary);
  }, [areas, activeAreas, boundaries]);

  /* What every badge below counts FROM. Chains and practices are excluded
     here whenever their toggle is off (the resting state), same predicate as
     `filtered` uses for pins. Without this, a badge counts the whole book
     while the map only draws the chain/practice-free subset, so "HQ potential
     A 5" reads as a lie when four of the five are Whole Foods pins nobody can
     see (Juan, 2026-08-06). Deliberately NOT filtered by tier/area/lead
     status: those chips ask "how many of X", so X's own count must stay
     whole for every OTHER chip to still make sense picked alongside it. */
  const visibleAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (showChains || !a.chain_excluded) &&
          (showPractices || !a.practice_excluded) &&
          // Closed is a HQ lead-status bucket, not a place Juan drives: it never
          // belongs on a field map, filterable or not (Juan, 2026-08-28).
          a.lead_status !== "Closed",
      ),
    [accounts, showChains, showPractices],
  );

  const tierCounts = useMemo(() => {
    const counts: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
    for (const a of visibleAccounts) if (a.tier) counts[a.tier] += 1;
    return counts;
  }, [visibleAccounts]);

  /* LEAD STATUS (0028), a dropdown rather than another chip row: six options
     on top of the seven tier chips and fourteen area chips would be a wall of
     controls, and unlike those two this one is a single choice, not a set.

     Options are built from what is actually in the territory, not from the six
     the property defines, so the menu never offers a status that would return
     an empty map. Labels come from LEAD_STATUS_LABEL where known and fall
     back to the raw value, so a seventh option added in HubSpot tomorrow shows
     up as itself instead of disappearing. Counted the same way the chips are. */
  const leadStatusOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of visibleAccounts) {
      // A WAYPOINT HAS NO LEAD STATUS AND NEVER WILL. Juan's apartment was the
      // entire "New to activate (1)" bucket on 2026-08-05, which read as a
      // sales lead nobody had worked and was really just his front door. Its
      // null is not a gap in the CRM, it is a category error, so it is left out
      // of this filter rather than counted as an unworked account.
      if (a.lifecycle === "waypoint") continue;
      const key = a.lead_status ?? NO_LEAD_STATUS;
      c.set(key, (c.get(key) ?? 0) + 1);
    }
    return [...c.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([value, count]) => ({
        value,
        count,
        label: value === NO_LEAD_STATUS ? NO_LEAD_STATUS_LABEL : LEAD_STATUS_LABEL[value] ?? value,
      }));
  }, [visibleAccounts]);

  // What the collapsed Filters button has to admit to hiding. Chains and
  // practices are counted only when SHOWN, because hidden is their resting
  // state and a badge that reads "2" on a map nobody has touched is noise.
  const activeFilterCount =
    activeAreas.size +
    activeTiers.size +
    activeLeadStatuses.size +
    (showChains ? 1 : 0) +
    (showPractices ? 1 : 0);

  const areaCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of visibleAccounts) if (a.area) c[a.area] = (c[a.area] ?? 0) + 1;
    return c;
  }, [visibleAccounts]);

  // How many each chip is currently hiding, for its own label. Not a
  // tier/area chip because neither is exploratory the way those are: they
  // are the semi-permanent classifications from exclude_chains.py (0024) and
  // exclude_practices.py (0025), and these buttons are only the show/hide
  // half of it, not the tag itself.
  const chainExcludedCount = useMemo(
    () => accounts.filter((a) => a.chain_excluded).length,
    [accounts],
  );
  const practiceExcludedCount = useMemo(
    () => accounts.filter((a) => a.practice_excluded).length,
    [accounts],
  );

  /* Tier and area narrow INDEPENDENTLY and combine with AND. Picking "A" and
     "San Diego" asks for the A accounts in San Diego, which is a question worth
     asking; making one filter reset the other would make it unaskable. showChains
     and showPractices are the last two: OFF drops every matching pin regardless
     of tier or area, same as do_not_visit would if the map filtered it out
     outright. */
  const filtered = useMemo(
    () =>
      visibleAccounts.filter(
        (a) =>
          (activeTiers.size === 0 || (a.tier !== null && activeTiers.has(a.tier))) &&
          (activeAreas.size === 0 || (a.area !== null && activeAreas.has(a.area))) &&
          (activeLeadStatuses.size === 0 ||
            activeLeadStatuses.has(a.lead_status ?? NO_LEAD_STATUS)),
      ),
    [visibleAccounts, activeTiers, activeAreas, activeLeadStatuses],
  );

  function toggleArea(id: string) {
    setSelected(null);
    setActiveAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTier(t: Tier) {
    setSelected(null);
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const [mapReady, setMapReady] = useState(false);
  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  /* THE VIEWPORT FIT, AND WHY IT HANGS OFF `idle` RATHER THAN AN EFFECT.
     Written twice as a plain effect first, and both versions lost the same way: the
     fit is imperative, so anything that re-renders the map after it (a polygon set
     changing, a marker remount) puts the viewport back and nothing retries. Selecting
     San Diego filtered the pins correctly and left the camera over Nevada.

     `idle` fires after the map has settled, whatever settled it, so a fit that gets
     undone is simply redone. The signature guard is what stops that from being an
     infinite loop: fitBounds itself causes an idle, and on that pass the signature
     already matches and the handler does nothing. */
  const fitKey = useMemo(() => filtered.map((a) => a.id).join(","), [filtered]);
  const fittedRef = useRef("");

  /* THE DAY'S ROUTE OUTRANKS THE TERRITORY (Juan, 2026-08-31): with a route
     built for the active day, "zoomed for the territory" is the wrong
     default -- he is looking at today's five stops, not all 331 accounts
     scattered from Fresno to the border. `routeStops` already comes in
     scoped to whichever day tab is active (route-context.tsx keys the draft
     by day), so switching days naturally changes this key and re-frames.
     Falls back to the territory fit below whenever the active day has no
     stops yet, which is every day before Juan builds one. */
  const routeFitKey = useMemo(
    () =>
      [
        ...(routeStart ? [`s:${routeStart.lat},${routeStart.lng}`] : []),
        ...routeStops.map((s) => `${s.id}:${s.lat},${s.lng}`),
        ...(routeEnd ? [`e:${routeEnd.lat},${routeEnd.lng}`] : []),
      ].join("|"),
    [routeStops, routeStart, routeEnd],
  );

  const fitToPins = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeStops.length > 0) {
      const key = `route:${routeFitKey}`;
      if (fittedRef.current === key) return;
      const bounds = new google.maps.LatLngBounds();
      for (const s of routeStops) bounds.extend({ lat: s.lat, lng: s.lng });
      if (routeStart) bounds.extend({ lat: routeStart.lat, lng: routeStart.lng });
      if (routeEnd) bounds.extend({ lat: routeEnd.lat, lng: routeEnd.lng });
      // Wider padding than the territory fit (64 vs 48): a handful of stops
      // pinned right against the pane's edge is harder to read than a
      // 300-pin territory losing the same margin.
      map.fitBounds(bounds, 64);
      fittedRef.current = key;
      return;
    }

    if (filtered.length === 0 || fittedRef.current === fitKey) return;
    const bounds = new google.maps.LatLngBounds();
    for (const a of filtered) bounds.extend({ lat: a.lat, lng: a.lng });
    map.fitBounds(bounds, 48);
    fittedRef.current = fitKey;
  }, [filtered, fitKey, routeStops, routeFitKey, routeStart, routeEnd]);

  // A new filter, or a change to the active day's route, means the previous
  // fit no longer describes what is on screen, so the guard is cleared and
  // the next idle re-frames.
  useEffect(() => {
    fittedRef.current = "";
    fitToPins();
  }, [fitKey, routeFitKey, mapReady, fitToPins]);

  /* OPEN ON JUAN, kinda zoomed in. The fix arrives async (1-3s on a phone), so
     this cannot be an initial-center option: by then the territory fit has run.
     When the position lands, the camera moves to it once, at street-cluster
     zoom, and the fit signature is stamped so the next idle does not yank the
     viewport back to the whole territory. Touching a filter afterwards is an
     explicit ask to see those pins, and re-fits as before.

     Skipped when the active day already has a route (2026-08-31): the route
     fit above already gave the camera a purposeful frame around today's
     stops, and "recenter on wherever Juan is standing right now, zoomed to a
     generic street level" is a worse view of that than the one it would
     replace. His GPS fix landing async is exactly the failure mode this
     guards against -- without it, a route fit that ran first could get
     silently overwritten a second later when the position arrives. */
  const userCentredRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLoc || !mapReady || userCentredRef.current || routeStops.length > 0) return;
    map.setCenter(userLoc);
    map.setZoom(12);
    fittedRef.current = fitKey;
    userCentredRef.current = true;
  }, [userLoc, mapReady, fitKey, routeStops.length]);

  /**
   * REFIT WHEN THE PANE CHANGES SHAPE (2026-08-26, with the two-pane layout).
   *
   * fitBounds solves for the container's aspect ratio at the moment it runs.
   * Going from a full-width map to a half-width one, or back, changes that
   * ratio without changing `filtered`, so the guard above holds and the camera
   * keeps a framing computed for a box that no longer exists: pins fall off
   * the sides at the very moment the map became a dashboard pane.
   *
   * Only re-frames if the user has not taken the camera somewhere themselves,
   * which the existing guards already track. A resize is a layout event, not
   * an instruction to abandon where he panned to.
   */
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = el.clientWidth;
    let t: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // Ignore the sub-pixel churn a scrollbar or a font swap causes.
      if (Math.abs(w - last) < 40) return;
      last = w;
      if (userCentredRef.current) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        fittedRef.current = "";
        fitToPins();
      }, 120);
    });
    ro.observe(el);
    return () => {
      if (t) clearTimeout(t);
      ro.disconnect();
    };
  }, [fitToPins]);

  /* SHOW IN MAP, driven by the ten-closest list. A fresh `focus` object arrives
     on every click (even a repeat click on the same account), so this effect
     always re-fires. Fits the camera to the two points that matter, Juan and
     the account, and opens that account's InfoWindow exactly as a click on
     its pin would (the info card renders at the account's coordinates whether
     or not a tier/area filter currently hides its dot). Deliberately does not
     touch activeTiers/activeAreas: clearing them would change `filtered`,
     which changes fitKey, which would trip the fitKey effect above and refit
     the camera back out to every pin one tick after this one zoomed in. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focus) return;

    // A route stop carries a "custom:" id and lives in customStops, not in the
    // book. Same camera behaviour either way, so only the lookup branches.
    const target = focus.id.startsWith("custom:")
      ? customStops.find((s) => s.id === focus.id)
      : accounts.find((a) => a.id === focus.id);
    if (!target) return;

    if ("kind" in target) {
      setSelected(null);
      setSelectedStop(target);
    } else {
      setSelectedStop(null);
      setSelected(target);
    }

    if (userLoc) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(userLoc);
      bounds.extend({ lat: target.lat, lng: target.lng });
      map.fitBounds(bounds, 96);
    } else {
      map.setCenter({ lat: target.lat, lng: target.lng });
      map.setZoom(14);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, mapReady]);

  if (!apiKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-[#E2DFD5] bg-white p-8 text-center">
        <p className="max-w-[50ch] text-[13.5px] leading-relaxed text-[#5B6560]">
          No Google Maps API key configured. Set{" "}
          <code className="rounded bg-[#F3EFE3] px-1 py-0.5 text-[12.5px]">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </code>{" "}
          to render pins. Nothing here is being simulated in its place.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-[#E2DFD5] bg-white p-8 text-[13.5px] text-[#A0762C]">
        Google Maps failed to load. Check the API key restrictions in the Cloud Console.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-[#E2DFD5] bg-white text-[13.5px] text-[#8A928C]">
        Loading map...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      {/* THE FILTERS COLLAPSE BY DEFAULT (Juan, 2026-08-28), at every width.
          These three chip rows are 14 areas + 7 grades + up to 5 lead
          statuses: a wall of buttons nobody needs on screen just to read the
          map. Filtering is a thing you do occasionally; the map is a thing
          you read constantly. The summary line stays visible whether the
          rows are open or not, so "112 of 253" and any active narrowing are
          never hidden behind a tap: a filtered map that looks unfiltered is
          how you conclude a territory is empty. */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E2DFD5] bg-white px-3 py-2">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[#3D4A44]"
        >
          <Ico name={filtersOpen ? "chevron-up" : "chevron-down"} size={13} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#14201B] px-1 text-[10.5px] font-semibold tabular-nums text-[#F7F6F1]">
              {activeFilterCount}
            </span>
          )}
        </button>
        <span className="text-[12px] tabular-nums text-[#8A928C]">
          {filtered.length} of {accounts.length}
        </span>
      </div>

      <div className={filtersOpen ? "contents" : "hidden"}>
      {/* Area filter. Each chip carries its area's colour, and that same colour fills
          the area's frontier on the map, so the control and the region it controls are
          visibly one thing. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E2DFD5] bg-white px-3 py-2">
        {areas.map((a) => {
          const active = activeAreas.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleArea(a.id)}
              aria-pressed={active}
              title={a.brief ?? undefined}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                active ? "text-[#F7F6F1]" : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
              }`}
              style={active ? { background: a.color, borderColor: a.color } : undefined}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: active ? "#F7F6F1" : a.color }}
              />
              {a.label}
              <span className={`tabular-nums ${active ? "opacity-70" : "text-[#8A928C]"}`}>
                {areaCounts[a.id] ?? 0}
              </span>
            </button>
          );
        })}
        {activeAreas.size > 0 && (
          <button
            type="button"
            onClick={() => setActiveAreas(new Set())}
            className="rounded-md px-2 py-1 text-[12.5px] text-[#8A928C] underline-offset-2 hover:text-[#3D4A44] hover:underline"
          >
            clear
          </button>
        )}
      </div>

      {/* HQ POTENTIAL filter, multi-select. Empty selection means unfiltered
          rather than empty, so clicking a letter narrows and clicking it again
          widens back out -- there is no separate "all" button to hunt for.

          LABELLED, since 2026-08-02. These letters are nb_accounts.potential_hq
          (A-G, mirrored from HubSpot's potential__cloned_), NOT the A-D OS tier
          the Clients table and the week plan rank by. Unlabelled they read as one
          number that contradicts itself: 214 of the 273 accounts carry a different
          letter on each scale, by design. See TierChip in lib/ui.tsx. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E2DFD5] bg-white px-3 py-2">
        <span
          className="mr-0.5 text-[12px] text-[#8A928C]"
          title="HubSpot's own potential grade (potential__cloned_, A-G). HQ owns it; the OS mirrors it. Not the A-D OS tier."
        >
          HQ potential
        </span>
        {TIERS.map((t) => {
          const active = activeTiers.has(t);
          const dot = POTENTIAL_COLOR[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleTier(t)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                active
                  ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                  : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
              }`}
            >
              {/* The chip wears the same dot its pins wear, so the legend and
                  the control are one thing. Gradeless letters get no dot. */}
              {dot && (
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: dot }} />
              )}
              {t} <span className="tabular-nums opacity-70">{tierCounts[t]}</span>
            </button>
          );
        })}
        {activeTiers.size > 0 && (
          <button
            type="button"
            onClick={() => setActiveTiers(new Set())}
            className="rounded-md px-2 py-1 text-[12.5px] text-[#8A928C] underline-offset-2 hover:text-[#3D4A44] hover:underline"
          >
            clear
          </button>
        )}

        {/* THE CHAINS BUTTON. Juan's ask 2026-08-04: the big national chains
            (Whole Foods, Sprouts, Trader Joe's, CVS/Walgreens, Target)
            crowd out the independent stores this territory is actually
            built on, so they are hidden by default. This chip is only the
            undo, and it is semi-permanent same as the hide: the click
            persists to nb_ui_prefs (migration 0024) so it survives a
            reload and follows Juan to his other device, it does not just
            flip a local filter back for this page view. */}
        {chainExcludedCount > 0 && (
          <button
            type="button"
            onClick={onToggleShowChains}
            aria-pressed={showChains}
            title={
              showChains
                ? "Hide the big national chains again"
                : `${chainExcludedCount} big-chain account(s) hidden (Whole Foods, Sprouts, Trader Joe's, CVS/Walgreens, Target)`
            }
            className={`ml-1 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
              showChains
                ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
            }`}
          >
            <Ico name="accounts" size={12} />
            {showChains ? "Chains shown" : "Chains hidden"}{" "}
            <span className="tabular-nums opacity-70">{chainExcludedCount}</span>
          </button>
        )}
        {/* THE PRACTICES BUTTON, same shape and same day as the chains one.
            Juan's ask: single-practitioner offices (a chiropractor, an M.D.,
            an N.D., an L.Ac.) are not a store either, and channel = 'clinic'
            is already how the enrichment pipeline tells them apart from one
            (see 0025). Same persistence, same nb_ui_prefs row, independent
            of the chains toggle: showing chains back does not also show
            practices, and vice versa. */}
        {practiceExcludedCount > 0 && (
          <button
            type="button"
            onClick={onToggleShowPractices}
            aria-pressed={showPractices}
            title={
              showPractices
                ? "Hide single-practitioner offices again"
                : `${practiceExcludedCount} private-practice account(s) hidden (chiropractors, MDs, NDs, L.Ac.s, ...)`
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
              showPractices
                ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
            }`}
          >
            <Ico name="review" size={12} />
            {showPractices ? "Practices shown" : "Practices hidden"}{" "}
            <span className="tabular-nums opacity-70">{practiceExcludedCount}</span>
          </button>
        )}
        {/* THE CHAIN TOGGLE. Only offered once there is a route to chain --
            two straight lines to nowhere is not a control worth showing on an
            empty map. */}
        {routeStops.length > 0 && (
          <button
            type="button"
            onClick={() => setShowRouteChain((v) => !v)}
            aria-pressed={showRouteChain}
            title={
              showRouteChain
                ? "Hide the route line and stop numbers"
                : "Draw straight lines between the route stops, in order, numbered"
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
              showRouteChain
                ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
            }`}
          >
            <Ico name="route" size={12} />
            {showRouteChain ? "Route line on" : "Route line"}{" "}
            <span className="tabular-nums opacity-70">{routeStops.length}</span>
          </button>
        )}
        {/* THE KEY TO THE BANDS. Four colours mean nothing without it, and the
            one that matters most, walkable, is the one nobody would guess. Only
            rendered when there are bands on screen to explain: a legend for a
            line that is not drawn is chrome. */}
        {chainSegments.length > 0 && (
          <span className="flex items-center gap-2.5 text-[11.5px] text-[#8A928C]">
            {(["walk", "near", "far", "haul"] as const).map((band) => (
              <span key={band} className="inline-flex items-center gap-1" title={BAND_STYLE[band].title}>
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full ring-1 ring-[#14201B]/40"
                  style={{ backgroundColor: BAND_STYLE[band].color }}
                />
                {band === "walk" ? "walk" : band === "near" ? "25m" : band === "far" ? "45m" : "45m+"}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* LEAD STATUS, Juan's ask 2026-08-05, chips rather than the dropdown it
          shipped as earlier that day. Same grammar as the potential row above:
          multi-select, empty means unfiltered, click again to widen.

          Options are built from what is actually in the territory rather than
          from the six the property defines, so a chip never offers a status
          that would empty the map. "New to activate" is the null bucket, not a
          HubSpot value: see NO_LEAD_STATUS_LABEL. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E2DFD5] bg-white px-3 py-2">
        <span
          className="mr-0.5 text-[12px] text-[#8A928C]"
          title="HubSpot's Lead Status (hs_lead_status). HQ owns it; the OS mirrors it, pull-only."
        >
          Lead status
        </span>
        {leadStatusOptions.map((o) => {
          const active = activeLeadStatuses.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggleLeadStatus(o.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                active
                  ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                  : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
              }`}
            >
              {o.label} <span className="tabular-nums opacity-70">{o.count}</span>
            </button>
          );
        })}
        {activeLeadStatuses.size > 0 && (
          <button
            type="button"
            onClick={() => setActiveLeadStatuses(new Set())}
            className="rounded-md px-2 py-1 text-[12.5px] text-[#8A928C] underline-offset-2 hover:text-[#3D4A44] hover:underline"
          >
            clear
          </button>
        )}
      </div>
      </div>

      <div className="min-h-0 flex-1">
        <GoogleMap
          mapContainerStyle={CONTAINER_STYLE}
          onLoad={onLoad}
          onIdle={fitToPins}
          options={{
            styles: MAP_STYLE,
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            // Trims the "Keyboard shortcuts" link out of the attribution bar.
            // The Google logo and the "Map data © Google / Terms / Report a
            // map error" line stay: Maps Platform's terms require them, and
            // hiding them (CSS or otherwise) risks the API key itself.
            keyboardShortcuts: false,
          }}
        >
          {shownAreas.map((a) => (
            <PolygonF
              key={a.id}
              paths={a.boundary!.coordinates.map((poly) =>
                poly[0].map(([lng, lat]) => ({ lat, lng })),
              )}
              options={{
                fillColor: a.color,
                fillOpacity: 0.1,
                strokeColor: a.color,
                strokeOpacity: 0.55,
                strokeWeight: 1.5,
                clickable: false,
                zIndex: 1,
              }}
            />
          ))}

          {filtered.map((a) => {
            const potential = a.tier ? POTENTIAL_COLOR[a.tier] : undefined;
            const routeNum = showRouteChain ? routeNumberById.get(a.id) : undefined;
            return (
              <MarkerF
                key={a.id}
                position={{ lat: a.lat, lng: a.lng }}
                opacity={a.do_not_visit ? 0.45 : 1}
                onClick={() => {
                  setSelectedStop(null);
                  setSelected(a);
                }}
                zIndex={routeNum ? 5 : potential ? 3 : 2}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: routeNum ? 11 : potential ? 7 : 6,
                  fillColor: routeNum ? "#14201B" : potential ?? ((a.area && areaById.get(a.area)?.color) || "#5B6560"),
                  fillOpacity: 1,
                  strokeColor: "#F7F6F1",
                  strokeWeight: routeNum ? 2 : 1.5,
                }}
                label={
                  routeNum
                    ? { text: String(routeNum), color: "#F7F6F1", fontSize: "11px", fontWeight: "700" }
                    : undefined
                }
              />
            );
          })}

          {/* THE ROUTE CHAIN: straight lines, start -> stops in order -> end
              (0040: each defaults to the waypoint, either can be overridden),
              matching exactly what RoutePanel numbers and what its start/end
              rows measure. No routing engine here, so this is deliberately
              the honest straight-line hop, not a driving path -- see
              drive-actions.ts for the real one. */}
          {/* THE CASINGS. A dark stroke under each fluorescent one, drawn as a
              separate pass so every casing sits below every colour and no
              segment's casing can cut across its neighbour's fill. This is what
              lets the greens and yellows stay genuinely fluorescent on a pale
              basemap instead of being darkened into legibility. `haul` opts out
              (casing 0): it is already the widest and quietest band. */}
          {chainSegments
            .filter((seg) => BAND_STYLE[seg.band].casing > 0)
            .map((seg) => (
              <PolylineF
                key={`casing:${seg.key}`}
                path={seg.path}
                options={{
                  strokeColor: "#14201B",
                  strokeOpacity: 0.7,
                  strokeWeight: BAND_STYLE[seg.band].casing,
                  zIndex: 3,
                  clickable: false,
                }}
              />
            ))}

          {/* THE BANDS THEMSELVES. Colour and weight both rank the same way, so
              the day still reads correctly in a screenshot and to anyone who
              cannot separate red from green. */}
          {chainSegments.map((seg) => {
            const style = BAND_STYLE[seg.band];
            return (
              <PolylineF
                key={`band:${seg.key}`}
                path={seg.path}
                options={{
                  strokeColor: style.color,
                  strokeOpacity: seg.band === "haul" ? 0.55 : 1,
                  strokeWeight: style.weight,
                  zIndex: 4,
                  clickable: false,
                }}
              />
            );
          })}

          {/* DIRECTION, once per segment rather than repeating along it. The
              old chain repeated an arrow every 110px, which on a banded line
              would stipple a short walkable hop into dashes. `walk` skips it
              outright: at that length the arrow would be the whole segment. */}
          {chainSegments
            .filter((seg) => seg.band !== "walk")
            .map((seg) => (
              <PolylineF
                key={`arrow:${seg.key}`}
                path={seg.path}
                options={{
                  strokeOpacity: 0,
                  zIndex: 5,
                  clickable: false,
                  icons: [
                    {
                      icon: {
                        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale: 3,
                        strokeColor: "#14201B",
                        fillColor: "#14201B",
                        fillOpacity: 1,
                      },
                      offset: "50%",
                    },
                  ],
                }}
              />
            ))}

          {/* ONLY THE HAULS CARRY THEIR NUMBER (Juan, 2026-08-26). Putting a
              minute count on all four bands would be a wall of digits over the
              territory; the band already says what the leg costs. The 46+ leg
              is the one where the exact figure changes the decision, so it is
              the one that says it. Label-only markers: no icon is drawn, just
              the text beside the middle of the line. */}
          {chainSegments
            .filter((seg) => BAND_STYLE[seg.band].label)
            .map((seg) => (
              <MarkerF
                key={`label:${seg.key}`}
                position={seg.mid}
                clickable={false}
                zIndex={6}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 0, fillOpacity: 0, strokeOpacity: 0 }}
                label={{
                  text: `${seg.minutes} min`,
                  color: "#3D4A44",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              />
            ))}

          {/* THE UNBANDED FALLBACK. Drawn only when the router gave us nothing,
              so the route is still visible as a shape without any segment
              claiming a drive time nobody measured. */}
          {chainSegments.length === 0 && chainPath.length > 1 && (
            <PolylineF
              path={chainPath}
              options={{
                strokeColor: "#14201B",
                strokeOpacity: 0.85,
                strokeWeight: 2.5,
                zIndex: 4,
                clickable: false,
                icons: [
                  {
                    icon: {
                      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                      scale: 3,
                      strokeColor: "#14201B",
                      fillColor: "#14201B",
                      fillOpacity: 1,
                    },
                    offset: "50%",
                    repeat: "110px",
                  },
                ],
              }}
            />
          )}

          {/* THE TWO ENDS OF THE DAY (Juan, 2026-08-26: "two red home in circle
              icons on the map, one for start one for end").

              Every other marker on this map is a place he might sell something.
              These two are the only ones that are not: they are where the day
              opens and where it closes, and until now they were invisible
              unless the start happened to be the waypoint account, which drew
              as an ordinary grey circle indistinguishable from a store.

              Red and circular, above every pin and both route lines, because
              the question they answer ("does this day actually get me back") is
              read at a glance across the whole map, not by clicking. Start and
              end are the same mark on purpose: which is which is legible from
              where the chain's arrows point, and two different glyphs for one
              concept is a legend to memorize. When both ends are the same
              address, only one renders, because there is only one place. */}
          {showRouteChain &&
            routeStops.length > 0 &&
            endMarkers.map((m) => (
              <MarkerF
                key={m.key}
                position={{ lat: m.lat, lng: m.lng }}
                title={m.title}
                clickable={false}
                zIndex={9}
                icon={{
                  url: HOME_PIN_SVG,
                  scaledSize: new google.maps.Size(30, 30),
                  anchor: new google.maps.Point(15, 15),
                }}
              />
            ))}

          {/* ROUTE STOPS THAT ARE NOT ACCOUNTS: lunch, the hotel, a warehouse.
              Drawn as a square, never a circle, because every circle on this
              map is a company in the book and a lunch place is not one of them.
              Amber rather than an area or potential colour for the same reason:
              nothing on this map should read as "an account we have not graded
              yet" unless it is one. Above the pins, below "you are here". */}
          {customStops.map((s) => {
            const routeNum = showRouteChain ? routeNumberById.get(s.id) : undefined;
            return (
              <MarkerF
                key={s.id}
                position={{ lat: s.lat, lng: s.lng }}
                onClick={() => {
                  setSelected(null);
                  setSelectedStop(s);
                }}
                zIndex={routeNum ? 5 : 3}
                title={s.label}
                icon={{
                  path: "M -6 -6 L 6 -6 L 6 6 L -6 6 Z",
                  scale: routeNum ? 1.9 : 1,
                  fillColor: "#A0762C",
                  fillOpacity: 1,
                  strokeColor: "#F7F6F1",
                  strokeWeight: routeNum ? 2 : 1.5,
                }}
                label={
                  routeNum
                    ? { text: String(routeNum), color: "#F7F6F1", fontSize: "11px", fontWeight: "700" }
                    : undefined
                }
              />
            );
          })}

          {selectedStop && (
            <InfoWindowF
              position={{ lat: selectedStop.lat, lng: selectedStop.lng }}
              onCloseClick={() => setSelectedStop(null)}
            >
              <div className="min-w-[180px] max-w-[240px] p-1 text-[13px] text-[#14201B]">
                <div className="font-semibold">{selectedStop.label}</div>
                <div className="mt-0.5 text-[12px] text-[#5B6560]">{selectedStop.address}</div>
                <div className="mt-1 text-[11.5px] uppercase tracking-[0.1em] text-[#8A928C]">
                  {CUSTOM_STOP_LABEL[selectedStop.kind]} · on your route
                </div>
                <a
                  href={appleMapsUrl(selectedStop)}
                  className="mt-2 flex w-full items-center justify-center rounded-md bg-[#2C6A46] px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  GO
                </a>
              </div>
            </InfoWindowF>
          )}

          {/* You are here. Blue, the one convention every map user already
              knows; no area or grade uses it, so it cannot be mistaken for an
              account. Not clickable: it opens no card and sells nothing. */}
          {userLoc && (
            <MarkerF
              position={userLoc}
              zIndex={4}
              clickable={false}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: "#1A73E8",
                fillOpacity: 1,
                strokeColor: "#FFFFFF",
                strokeWeight: 2.5,
              }}
            />
          )}

          {selected && (
            <InfoWindowF
              position={{ lat: selected.lat, lng: selected.lng }}
              onCloseClick={() => setSelected(null)}
            >
              <div className="min-w-[180px] max-w-[240px] p-1 text-[13px] text-[#14201B]">
                <div className="font-semibold">{selected.name}</div>
                {selected.street && (
                  <div className="mt-0.5 text-[12px] text-[#5B6560]">
                    {selected.street}
                    {selected.city ? `, ${selected.city}` : ""}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11.5px] uppercase tracking-[0.1em] text-[#8A928C]">
                  {selected.tier && <span>HQ potential {selected.tier}</span>}
                  {selected.area && <span>{areaById.get(selected.area)?.label ?? selected.area}</span>}
                  {realChannel(selected.channel) && <span>{realChannel(selected.channel)}</span>}
                  <span>·</span>
                  <span>{selected.lifecycle || "unknown"}</span>
                </div>
                {selected.do_not_visit && (
                  <div className="mt-1 text-[11.5px] text-[#A0762C]">do not visit</div>
                )}
                {/* ADD TO ROUTE, the primary action on this card now. A pin is
                    opened to answer "should I go here", and the answer being
                    yes should cost one tap. Once it is on the route the button
                    becomes a statement rather than staying a live control:
                    tapping it again can only be a mis-tap, since a stop cannot
                    be visited twice in one run. Removing is the route panel's
                    job, where the stop and its position are both visible. */}
                <button
                  type="button"
                  onClick={() => onAddToRoute(selected.id, selected.lat, selected.lng)}
                  disabled={inRoute.has(selected.id)}
                  className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold transition-opacity ${
                    inRoute.has(selected.id)
                      ? "cursor-default bg-[#EEECE3] text-[#5B6560]"
                      : "bg-[#2C6A46] text-white hover:opacity-90"
                  }`}
                >
                  <Ico name={inRoute.has(selected.id) ? "check" : "route"} size={13} />
                  {inRoute.has(selected.id) ? "On the route" : "Add to route"}
                </button>
                <div className="mt-2">
                  <AccountLink
                    id={selected.id}
                    className="text-[12.5px] font-medium underline-offset-2 hover:underline"
                  >
                    View account
                  </AccountLink>
                  {/* Same three handles as a route stop and a profile, in the
                      same order, so the pin card is not a shorter story than
                      the list the pin feeds. */}
                  <ReachLinks
                    className="mt-1.5"
                    hubspotId={selected.hubspot_company_id}
                    website={selected.website}
                    phone={selected.phone}
                  />
                </div>
              </div>
            </InfoWindowF>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}
