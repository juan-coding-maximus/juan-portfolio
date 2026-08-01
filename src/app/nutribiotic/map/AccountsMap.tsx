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

import { useCallback, useRef, useState } from "react";
import { GoogleMap, MarkerF, InfoWindowF, useLoadScript } from "@react-google-maps/api";
import type { MapAccount } from "../lib/dal";
import { AccountLink } from "../lib/modal";

const CONTAINER_STYLE = { width: "100%", height: "100%" };

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

export function AccountsMap({ accounts }: { accounts: MapAccount[] }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: apiKey ?? "" });
  const [selected, setSelected] = useState<MapAccount | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (accounts.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      for (const a of accounts) bounds.extend({ lat: a.lat, lng: a.lng });
      map.fitBounds(bounds, 48);
    },
    [accounts],
  );

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
    <GoogleMap
      mapContainerStyle={CONTAINER_STYLE}
      onLoad={onLoad}
      options={{
        styles: MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      }}
    >
      {accounts.map((a) => (
        <MarkerF
          key={a.id}
          position={{ lat: a.lat, lng: a.lng }}
          opacity={a.do_not_visit ? 0.45 : 1}
          onClick={() => setSelected(a)}
        />
      ))}

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
              <span>{selected.channel}</span>
              <span>·</span>
              <span>{selected.lifecycle}</span>
            </div>
            {selected.do_not_visit && (
              <div className="mt-1 text-[11.5px] text-[#A0762C]">do not visit</div>
            )}
            <AccountLink
              id={selected.id}
              className="mt-2 inline-block text-[12.5px] font-medium underline-offset-2 hover:underline"
            >
              View account
            </AccountLink>
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
}
