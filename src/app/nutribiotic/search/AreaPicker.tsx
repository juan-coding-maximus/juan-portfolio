"use client";

/**
 * THE AREA SELECTOR: drop as many pins as you want, and the search happens
 * inside that shape and nowhere else.
 *
 * WHY A POLYGON AND NOT A RADIUS (Juan, 2026-09-09). A circle is the wrong
 * shape for a sales territory. A retail strip is a mile of one boulevard; a
 * business district stops at a freeway; the good half of a neighbourhood is
 * the half on one side of the hill. Every circle big enough to contain the
 * strip also contains a residential mile Juan will never call, and those
 * results are not free: Google returns at most 60 per query, so junk inside
 * the circle is enumeration he does not get.
 *
 * SAME MAP STACK AS THE TERRITORY MAP, deliberately. GoogleMap / MarkerF /
 * PolygonF / PolylineF from @react-google-maps/api, the same MAP_STYLE palette,
 * the same NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. See map/AccountsMap.tsx: a second
 * maps integration in one app is two things to keep working and two ways for
 * this screen and that one to disagree about where a business is.
 *
 * THE SHAPE IS NOT THE FILTER, IT IS THE INSTRUCTION. What is drawn here goes
 * to the server as a vertex list; the bounding box is what Google is asked for
 * and the shape itself is enforced by a ray-cast in
 * places_search_ingest.point_in_polygon. Nothing in this file decides what is
 * inside: a browser-side test and a server-side test of the same shape are two
 * editable copies of one rule.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, PolygonF, PolylineF, useLoadScript } from "@react-google-maps/api";
import { Ico } from "../lib/ui";

export type Pin = { lat: number; lng: number };

const CONTAINER_STYLE = { width: "100%", height: "100%" };

/* The territory's own centre of gravity, used only as an opening frame when
   the browser will not say where Juan is. Not a search default and not a
   scope: nothing is searched until he draws. */
const FALLBACK_CENTER = { lat: 34.0195, lng: -118.4912 };

// Same muted palette as the territory map, so the two screens read as one
// system rather than as one editorial UI and one Google default.
const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f3f1ea" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a928c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f6f1" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d8d4c8" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f3f1ea" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ede9dc" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dde4e0" }] },
];

const toolBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 " +
  "text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] " +
  "disabled:cursor-not-allowed disabled:opacity-35";

/** Metres between two points, for the "N km across" readout. Same haversine
 *  the pipeline uses; it is a label on the shape, never a filter. */
function metres(a: Pin, b: Pin): number {
  const R = 6371008.8;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function AreaPicker({
  pins,
  onChange,
  disabled,
}: {
  pins: Pin[];
  onChange: (next: Pin[]) => void;
  /** True while a stage is in flight. The shape that produced the list on
   *  screen must not move underneath it. */
  disabled: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: apiKey ?? "" });
  const mapRef = useRef<google.maps.Map | null>(null);
  const [jump, setJump] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);
  const centred = useRef(false);

  const path = useMemo(() => pins.map((p) => ({ lat: p.lat, lng: p.lng })), [pins]);

  /* The bounding box's diagonal, which is the honest one-number description of
     how much ground the shape covers. Shown because Google's 60-result ceiling
     is a function of area, not of pin count: this is the number that says
     whether a sweep can actually enumerate what is inside it. */
  const span = useMemo(() => {
    if (pins.length < 2) return null;
    const lats = pins.map((p) => p.lat);
    const lngs = pins.map((p) => p.lng);
    return (
      metres(
        { lat: Math.min(...lats), lng: Math.min(...lngs) },
        { lat: Math.max(...lats), lng: Math.max(...lngs) },
      ) / 1000
    );
  }, [pins]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (centred.current || typeof navigator === "undefined" || !navigator.geolocation) return;
    /* Open where Juan is, when the browser will say. Async by nature (one to
       three seconds), so it is a recentre and not an initial option, and it
       only ever fires once and only before he has drawn anything. */
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (centred.current) return;
        centred.current = true;
        map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        map.setZoom(14);
      },
      () => {},
      { timeout: 8000, maximumAge: 600_000 },
    );
  }, []);

  const addPin = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (disabled || !e.latLng) return;
      onChange([...pins, { lat: e.latLng.lat(), lng: e.latLng.lng() }]);
    },
    [disabled, onChange, pins],
  );

  /* Jump-to is NAVIGATION, NOT SCOPE. It moves the camera and nothing else: no
     pin is dropped, no radius is implied, and a place Google cannot find says
     so rather than silently leaving the map where it was. */
  function goTo(e: React.FormEvent) {
    e.preventDefault();
    const q = jump.trim();
    const map = mapRef.current;
    if (!q || !map || typeof google === "undefined") return;
    setJumpError(null);
    new google.maps.Geocoder().geocode({ address: q }, (res, status) => {
      if (status !== "OK" || !res || res.length === 0) {
        setJumpError(`Google could not place "${q}". Pan the map instead.`);
        return;
      }
      centred.current = true;
      const g = res[0].geometry;
      if (g.viewport) map.fitBounds(g.viewport, 24);
      else {
        map.setCenter(g.location);
        map.setZoom(14);
      }
    });
  }

  if (!apiKey) {
    return (
      <Frame>
        <p className="max-w-[52ch] text-center text-[13px] leading-relaxed text-[#5B6560]">
          No Google Maps key configured, so there is no map to draw an area on. Set
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Nothing is being simulated in its place.
        </p>
      </Frame>
    );
  }
  if (loadError) {
    return (
      <Frame>
        <p className="text-[13px] text-[#A0762C]">
          Google Maps failed to load. Check the API key restrictions in the Cloud Console.
        </p>
      </Frame>
    );
  }
  if (!isLoaded) {
    return (
      <Frame>
        <p className="text-[13px] text-[#8A928C]">Loading map...</p>
      </Frame>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2DFD5] px-3 py-2">
        <form onSubmit={goTo} className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A9AFA9]">
              <Ico name="pin" size={13} />
            </span>
            <input
              value={jump}
              onChange={(e) => {
                setJump(e.target.value);
                setJumpError(null);
              }}
              placeholder="Jump to a city, street or landmark"
              aria-label="Move the map to a place"
              className="w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] py-1.5 pl-8 pr-2.5 text-[12.5px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
            />
          </div>
          <button type="submit" disabled={!jump.trim()} className={toolBtn}>
            Go
          </button>
        </form>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(pins.slice(0, -1))}
            disabled={disabled || pins.length === 0}
            className={toolBtn}
            title="Remove the last pin"
          >
            <Ico name="close" size={12} />
            Undo pin
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled || pins.length === 0}
            className={toolBtn}
            title="Remove every pin and start the area again"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <GoogleMap
          mapContainerStyle={CONTAINER_STYLE}
          center={FALLBACK_CENTER}
          zoom={11}
          onLoad={onLoad}
          onClick={addPin}
          options={{
            styles: MAP_STYLE,
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            keyboardShortcuts: false,
            // A crosshair says "this click places something". The default hand
            // says "this click pans", which is what it did before the rebuild.
            draggableCursor: disabled ? "default" : "crosshair",
          }}
        >
          {/* Two pins are a line, three or more are an area. Drawing a closed
              polygon over two points would show a shape that does not exist
              yet and cannot be searched. */}
          {pins.length >= 3 && (
            <PolygonF
              paths={path}
              options={{
                fillColor: "#14201B",
                fillOpacity: 0.08,
                strokeColor: "#14201B",
                strokeOpacity: 0.85,
                strokeWeight: 1.75,
                clickable: false,
                zIndex: 1,
              }}
            />
          )}
          {pins.length === 2 && (
            <PolylineF
              path={path}
              options={{ strokeColor: "#14201B", strokeOpacity: 0.6, strokeWeight: 1.75 }}
            />
          )}

          {pins.map((p, i) => (
            <MarkerF
              key={`${i}:${p.lat},${p.lng}`}
              position={p}
              draggable={!disabled}
              onDragEnd={(e) => {
                if (!e.latLng) return;
                const next = [...pins];
                next[i] = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                onChange(next);
              }}
              // Click a pin to remove that one, rather than only being able to
              // undo the last. Adjusting a corner is a drag; deleting a corner
              // is a click; neither should mean starting over.
              onClick={() => {
                if (disabled) return;
                onChange(pins.filter((_, j) => j !== i));
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: "#14201B",
                fillOpacity: 1,
                strokeColor: "#F7F6F1",
                strokeWeight: 2,
              }}
              label={{
                text: String(i + 1),
                color: "#F7F6F1",
                fontSize: "10px",
                fontWeight: "600",
              }}
              title={`Pin ${i + 1}. Drag to move it, click to remove it.`}
            />
          ))}
        </GoogleMap>

        {pins.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-[#E2DFD5] bg-white/95 px-3 py-2 text-[12.5px] text-[#5B6560]">
            Click the map to drop pins around the area you want to work. Three pins close it.
            Drag a pin to move it, click a pin to remove it.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#E2DFD5] px-3 py-2 text-[12px] text-[#8A928C]">
        <span className="tabular-nums">
          <span className="font-medium text-[#14201B]">{pins.length}</span> pin
          {pins.length === 1 ? "" : "s"}
          {span != null && <> · {span.toFixed(1)} km across</>}
        </span>
        {pins.length > 0 && pins.length < 3 ? (
          <span>{3 - pins.length} more to close the area.</span>
        ) : (
          span != null &&
          span > 6 && (
            <span className="text-[#A0762C]">
              Google returns at most 60 results per search. An area this wide comes back as
              whichever 60 it picked, not everything inside it.
            </span>
          )
        )}
      </div>
      {jumpError && (
        <div className="border-t border-[#E2DFD5] px-3 py-2 text-[12px] text-[#A0762C]">
          {jumpError}
        </div>
      )}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-[#E2DFD5] bg-white p-8">
      {children}
    </div>
  );
}
