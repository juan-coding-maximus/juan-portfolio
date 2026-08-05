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
import { GoogleMap, MarkerF, InfoWindowF, PolygonF, useLoadScript } from "@react-google-maps/api";
import type { MapAccount, TerritoryArea, Tier } from "../lib/dal";
import { AccountLink } from "../lib/modal";
import { Ico } from "../lib/ui";
import type { FocusRequest } from "./MapScreen";

const CONTAINER_STYLE = { width: "100%", height: "100%" };

const TIERS: Tier[] = ["A", "B", "C", "D", "E", "F", "G"];

// Portal 148711228 is EU-hosted, so the record host is app-eu1, not the
// app.hubspot.com in every generic doc example. Same URL shape already used
// for company deep-links in bridges/nutribiotic/portal_duplicates.py. 0-2 is
// HubSpot's own object type id for companies, not something this app assigns.
const HUBSPOT_COMPANY_URL = (hubspotId: string) =>
  `https://app-eu1.hubspot.com/contacts/148711228/record/0-2/${hubspotId}`;

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
   wearing their area colour and wear the grade instead. Red is A/B (the big
   capacity), orange is C/D. E-G keep the area dot: colouring "personal use
   through wholesale" like a hot lead would make the highlight meaningless.
   The same two colours mark the filter chips, so the legend is the control. */
const POTENTIAL_COLOR: Partial<Record<Tier, string>> = {
  A: "#B5372A",
  B: "#B5372A",
  C: "#D97E2B",
  D: "#D97E2B",
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
}: {
  accounts: MapAccount[];
  areas: TerritoryArea[];
  userLoc?: { lat: number; lng: number } | null;
  focus?: FocusRequest | null;
  showChains: boolean;
  onToggleShowChains: () => void;
  showPractices: boolean;
  onToggleShowPractices: () => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: apiKey ?? "" });
  const [selected, setSelected] = useState<MapAccount | null>(null);
  // Empty set reads as "no filter", not "nothing matches" -- the default view
  // is every pin, same as the map before tiers existed on it.
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(new Set());
  // Same convention as the tier filter: empty means unfiltered, so a chip narrows
  // on click and widens again on the second click.
  const [activeAreas, setActiveAreas] = useState<Set<string>>(new Set());
  const mapRef = useRef<google.maps.Map | null>(null);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  /* THE FRONTIERS. Each area's boundary was derived from the assignment by Voronoi
     dissolve (assign_areas.py), so the fill under a pin is always that pin's own area
     and the regions tile with no gaps. Drawn UNDER the markers, at low opacity, with
     a stronger stroke: the point is to read the division at a glance, not to compete
     with the pins for attention.

     clickable is off. A polygon covering half the state would otherwise swallow every
     click meant for a marker sitting on top of it. */
  const shownAreas = useMemo(
    () => areas.filter((a) => a.boundary && (activeAreas.size === 0 || activeAreas.has(a.id))),
    [areas, activeAreas],
  );

  const tierCounts = useMemo(() => {
    const counts: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
    for (const a of accounts) if (a.tier) counts[a.tier] += 1;
    return counts;
  }, [accounts]);

  const areaCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of accounts) if (a.area) c[a.area] = (c[a.area] ?? 0) + 1;
    return c;
  }, [accounts]);

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
      accounts.filter(
        (a) =>
          (activeTiers.size === 0 || (a.tier !== null && activeTiers.has(a.tier))) &&
          (activeAreas.size === 0 || (a.area !== null && activeAreas.has(a.area))) &&
          (showChains || !a.chain_excluded) &&
          (showPractices || !a.practice_excluded),
      ),
    [accounts, activeTiers, activeAreas, showChains, showPractices],
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

  const fitToPins = useCallback(() => {
    const map = mapRef.current;
    if (!map || filtered.length === 0 || fittedRef.current === fitKey) return;
    const bounds = new google.maps.LatLngBounds();
    for (const a of filtered) bounds.extend({ lat: a.lat, lng: a.lng });
    map.fitBounds(bounds, 48);
    fittedRef.current = fitKey;
  }, [filtered, fitKey]);

  // A new filter means the previous fit no longer describes what is on screen, so the
  // guard is cleared and the next idle re-frames.
  useEffect(() => {
    fittedRef.current = "";
    fitToPins();
  }, [fitKey, mapReady, fitToPins]);

  /* OPEN ON JUAN, kinda zoomed in. The fix arrives async (1-3s on a phone), so
     this cannot be an initial-center option: by then the territory fit has run.
     When the position lands, the camera moves to it once, at street-cluster
     zoom, and the fit signature is stamped so the next idle does not yank the
     viewport back to the whole territory. Touching a filter afterwards is an
     explicit ask to see those pins, and re-fits as before. */
  const userCentredRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLoc || !mapReady || userCentredRef.current) return;
    map.setCenter(userLoc);
    map.setZoom(12);
    fittedRef.current = fitKey;
    userCentredRef.current = true;
  }, [userLoc, mapReady, fitKey]);

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
    const account = accounts.find((a) => a.id === focus.id);
    if (!account) return;
    setSelected(account);
    if (userLoc) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(userLoc);
      bounds.extend({ lat: account.lat, lng: account.lng });
      map.fitBounds(bounds, 96);
    } else {
      map.setCenter({ lat: account.lat, lng: account.lng });
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
    <div className="flex h-full flex-col">
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
        <span className="ml-auto text-[12px] text-[#8A928C]">
          {filtered.length} of {accounts.length}
        </span>
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
            return (
              <MarkerF
                key={a.id}
                position={{ lat: a.lat, lng: a.lng }}
                opacity={a.do_not_visit ? 0.45 : 1}
                onClick={() => setSelected(a)}
                zIndex={potential ? 3 : 2}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: potential ? 7 : 6,
                  fillColor: potential ?? ((a.area && areaById.get(a.area)?.color) || "#5B6560"),
                  fillOpacity: 1,
                  strokeColor: "#F7F6F1",
                  strokeWeight: 1.5,
                }}
              />
            );
          })}

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
                  <span>{selected.channel}</span>
                  <span>·</span>
                  <span>{selected.lifecycle}</span>
                </div>
                {selected.do_not_visit && (
                  <div className="mt-1 text-[11.5px] text-[#A0762C]">do not visit</div>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <AccountLink
                    id={selected.id}
                    className="text-[12.5px] font-medium underline-offset-2 hover:underline"
                  >
                    View account
                  </AccountLink>
                  {selected.hubspot_company_id && (
                    <a
                      href={HUBSPOT_COMPANY_URL(selected.hubspot_company_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12.5px] font-medium text-[#8A928C] underline-offset-2 hover:text-[#3D4A44] hover:underline"
                    >
                      View in HubSpot
                    </a>
                  )}
                </div>
              </div>
            </InfoWindowF>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}
