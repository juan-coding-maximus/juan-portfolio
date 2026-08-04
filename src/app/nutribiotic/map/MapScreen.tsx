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

import { useEffect, useState } from "react";
import type { MapAccount, TerritoryArea } from "../lib/dal";
import { AccountsMap } from "./AccountsMap";
import { NearestClients } from "./NearestClients";

export type UserLoc = { lat: number; lng: number };
export type LocStatus = "pending" | "ok" | "denied" | "unavailable";

export function MapScreen({
  accounts,
  areas,
}: {
  accounts: MapAccount[];
  areas: TerritoryArea[];
}) {
  const [loc, setLoc] = useState<UserLoc | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>("pending");

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
      <div className="h-[calc(100vh-240px)] min-h-[520px] overflow-hidden rounded-lg border border-[#E2DFD5] md:min-h-[640px]">
        <AccountsMap accounts={accounts} areas={areas} userLoc={loc} />
      </div>

      <NearestClients accounts={accounts} userLoc={loc} status={locStatus} />
    </>
  );
}
