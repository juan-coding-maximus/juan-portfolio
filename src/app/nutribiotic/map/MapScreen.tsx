"use client";

/**
 * The map screen: one owner for the phone's position, shared by the two things
 * that need it, the map (open centred on Juan, kinda zoomed in) and the
 * ten-closest list below it. Position is asked for once on mount and never
 * stored anywhere: it exists in this component's state for this page view and
 * that is all. A denied or absent fix degrades honestly, the map falls back to
 * fitting the territory and the list says why it is empty instead of guessing
 * a location.
 */

import { useEffect, useRef, useState } from "react";
import type { MapAccount, TerritoryArea } from "../lib/dal";
import { toggleShowChainAccounts } from "../lib/prefs-actions";
import { AccountsMap } from "./AccountsMap";
import { NearestClients } from "./NearestClients";

export type UserLoc = { lat: number; lng: number };
export type LocStatus = "pending" | "ok" | "denied" | "unavailable";
export type FocusRequest = { id: string; n: number };

export function MapScreen({
  accounts,
  areas,
  initialShowChains,
}: {
  accounts: MapAccount[];
  areas: TerritoryArea[];
  initialShowChains: boolean;
}) {
  const [loc, setLoc] = useState<UserLoc | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>("pending");
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const focusN = useRef(0);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  // Server-persisted (nb_ui_prefs, migration 0024), not component state that
  // resets on reload: Juan asked for the undo to be semi-permanent same as
  // the exclusion itself. Optimistic locally, reverted if the write fails.
  const [showChains, setShowChains] = useState(initialShowChains);
  function toggleChains() {
    const next = !showChains;
    setShowChains(next);
    toggleShowChainAccounts(next).catch(() => setShowChains(!next));
  }

  // A fresh n on every click, even a repeat click on the same account, so the
  // map's focus effect (keyed on this signal) always re-fires and re-zooms
  // rather than no-op'ing on an unchanged id.
  function showInMap(id: string) {
    focusN.current += 1;
    setFocus({ id, n: focusN.current });
    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocStatus("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocStatus("ok");
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

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
        />
      </div>

      <NearestClients
        accounts={accounts}
        userLoc={loc}
        status={locStatus}
        onShowInMap={showInMap}
        showChains={showChains}
      />
    </>
  );
}
