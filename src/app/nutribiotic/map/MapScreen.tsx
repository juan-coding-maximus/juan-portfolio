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
import type { MapAccount, TerritoryArea } from "../lib/dal";
import {
  saveRouteDraft,
  toggleShowChainAccounts,
  toggleShowPracticeAccounts,
} from "../lib/prefs-actions";
import { AccountsMap } from "./AccountsMap";
import { NearestClients } from "./NearestClients";
import { RoutePanel } from "./RoutePanel";

export type UserLoc = { lat: number; lng: number };
export type LocStatus = "pending" | "ok" | "denied" | "timeout" | "unavailable";
export type FocusRequest = { id: string; n: number };

export function MapScreen({
  accounts,
  areas,
  initialShowChains,
  initialShowPractices,
  initialRouteDraft,
}: {
  accounts: MapAccount[];
  areas: TerritoryArea[];
  initialShowChains: boolean;
  initialShowPractices: boolean;
  initialRouteDraft: string[];
}) {
  const [loc, setLoc] = useState<UserLoc | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>("pending");
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

  /* THE HAND-BUILT ROUTE (0029). Ids, not account objects, because the ids are
     what the row stores and resolving them against `accounts` on every render
     means a stop that gets closed or leaves Juan's book simply stops being a
     stop, rather than sitting there as an unclickable blank.

     Optimistic like the toggles above: the list moves now and the row catches
     up, reverted if the write fails. A route is a scratchpad Juan edits half a
     dozen times at a light, and a save round-trip between each nudge would be
     felt every time. */
  const [routeIds, setRouteIds] = useState<string[]>(initialRouteDraft);

  function commitRoute(next: string[]) {
    const prev = routeIds;
    setRouteIds(next);
    saveRouteDraft(next).catch(() => setRouteIds(prev));
  }

  const routeStops = useMemo(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return routeIds.map((id) => byId.get(id)).filter((a): a is MapAccount => Boolean(a));
  }, [routeIds, accounts]);

  const inRoute = useMemo(() => new Set(routeIds), [routeIds]);

  function addToRoute(id: string) {
    if (inRoute.has(id)) return; // adding twice is a mis-tap, not a second visit
    commitRoute([...routeIds, id]);
  }

  function removeFromRoute(id: string) {
    commitRoute(routeIds.filter((x) => x !== id));
  }

  function moveInRoute(id: string, dir: -1 | 1) {
    const i = routeIds.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= routeIds.length) return;
    const next = [...routeIds];
    [next[i], next[j]] = [next[j], next[i]];
    commitRoute(next);
  }

  // A fresh n on every click, even a repeat click on the same account, so the
  // map's focus effect (keyed on this signal) always re-fires and re-zooms
  // rather than no-op'ing on an unchanged id.
  function showInMap(id: string) {
    focusN.current += 1;
    setFocus({ id, n: focusN.current });
    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (!("geolocation" in navigator)) {
      setLocStatus("unavailable");
      return;
    }
    setLocStatus("pending");

    const ask = (answerPending: boolean) =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
          setLocStatus("ok");
        },
        (e) => {
          if (e.code === e.PERMISSION_DENIED) setLocStatus("denied");
          else if (e.code === e.TIMEOUT) setLocStatus("timeout");
          else setLocStatus("unavailable");
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

  return (
    <>
      {/* THE FILTER ROWS LIVE INSIDE THIS BOX, so its height is not the map's
          height: the area and tier rows take ~128px off the top. At a 420px
          floor that left the map 292px tall, and fitBounds correctly solved for
          a zoom that fits 500km of California into 292px, which is why the map
          once opened showing Nevada and Texas. The floor has to clear the
          chrome before it is a map; on a phone the rows wrap taller, hence the
          smaller floor there paired with the ten-closest list right below. */}
      <div
        ref={mapBoxRef}
        className="h-[calc(100vh-240px)] min-h-[520px] overflow-hidden rounded-lg border border-[#E2DFD5] md:min-h-[640px]"
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
          onAddToRoute={addToRoute}
          inRoute={inRoute}
        />
      </div>

      {/* Route sits between the map and the ten-closest, where Juan asked for
          it: the map is where stops come from and the ten-closest is where the
          next one comes from, so the thing being assembled belongs between. */}
      <RoutePanel
        stops={routeStops}
        onMove={moveInRoute}
        onRemove={removeFromRoute}
        onClear={() => commitRoute([])}
        onShowInMap={showInMap}
      />

      <NearestClients
        accounts={accounts}
        userLoc={loc}
        status={locStatus}
        onRetryLoc={requestLoc}
        onShowInMap={showInMap}
        showChains={showChains}
        showPractices={showPractices}
      />
    </>
  );
}
