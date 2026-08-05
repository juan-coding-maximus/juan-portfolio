"use client";

/**
 * The hand-built route, between the map and the ten-closest list.
 *
 * Juan's ask 2026-08-05: a pin's card gets "add to route", the stops collect in
 * a list under the map, each stop moves up and down or X's out, and the list
 * stays until he removes something rather than resetting when he reloads.
 *
 * WHAT THIS IS NOT: plan_week.py's computed week. That one is derived from
 * cadence and drive time and is rebuilt from scratch on every run. This one is
 * whatever Juan tapped, in the order he tapped it, and nothing recomputes it
 * behind him. The two are kept in different places on purpose (see migration
 * 0029) so a planner run can never eat a list he assembled by hand.
 *
 * NO DRIVE TIME, NO OPTIMAL ORDER, NO TOTAL DISTANCE. Every one of those would
 * be a number this screen cannot honestly produce: there is no Directions API
 * call here, and a straight-line sum presented as a route length would read as
 * a drive estimate and be wrong by whatever the streets do. The one figure
 * shown per leg is the straight-line hop from the previous stop, labelled as
 * such, the same honesty the ten-closest list already keeps.
 */

import type { MapAccount } from "../lib/dal";
import { Ico } from "../lib/ui";
import { AccountLink } from "../lib/modal";

// Straight-line miles, same haversine the ten-closest list uses. Duplicated
// rather than shared because the two screens are free to diverge later and a
// six-line formula is a cheaper thing to keep in step than a coupling.
function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * One Apple Maps URL for the whole route: the last stop is the destination and
 * everything before it rides along as waypoints, so Juan gets one tap to a real
 * turn-by-turn instead of navigating stop by stop. Apple Maps caps the query it
 * will accept, so this stays a link rather than something that claims to be a
 * plan, and each stop keeps its own GO next to it as the reliable path.
 */
function appleMapsRouteUrl(stops: MapAccount[]): string {
  const daddr = stops.map((s) => `${s.lat},${s.lng}`).join("+to:");
  return `https://maps.apple.com/?daddr=${daddr}`;
}

export function RoutePanel({
  stops,
  onMove,
  onRemove,
  onClear,
  onShowInMap,
}: {
  stops: MapAccount[];
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onShowInMap: (id: string) => void;
}) {
  const header = (
    <div className="mb-3 mt-6 flex items-baseline justify-between">
      <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
        Route
      </h2>
      <span className="text-[12px] text-[#8A928C]">
        {stops.length === 0
          ? "built by hand, kept until you clear it"
          : `${stops.length} stop${stops.length === 1 ? "" : "s"}, in your order`}
      </span>
    </div>
  );

  if (stops.length === 0) {
    return (
      <>
        {header}
        <div className="rounded-lg border border-dashed border-[#E2DFD5] bg-white p-5 text-[13.5px] leading-relaxed text-[#5B6560]">
          No stops yet. Tap a pin on the map and choose{" "}
          <span className="font-medium text-[#3D4A44]">Add to route</span> to start one. The list
          stays put until you remove a stop, so a route you build in the morning is still here
          later.
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
        <ul className="divide-y divide-[#EEECE3]">
          {stops.map((a, i) => {
            const prev = i > 0 ? stops[i - 1] : null;
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#14201B] text-[11.5px] font-semibold tabular-nums text-[#F7F6F1]">
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <AccountLink
                    id={a.id}
                    className="block truncate text-[14px] font-medium leading-snug hover:underline"
                  >
                    {a.name}
                  </AccountLink>
                  <div className="mt-0.5 truncate text-[12.5px] text-[#5B6560]">
                    {a.street}
                    {a.city ? `, ${a.city}` : ""}
                  </div>
                  {prev && (
                    <div className="mt-0.5 text-[12px] text-[#8A928C]">
                      <span className="tabular-nums">{haversineMiles(prev, a).toFixed(1)} mi</span>{" "}
                      straight-line from stop {i}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {/* Up/down rather than drag: this is used one-handed in a
                      parked car, where a 44px button beats a drag target. */}
                  <button
                    type="button"
                    onClick={() => onMove(a.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${a.name} earlier`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Ico name="chevron-up" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(a.id, 1)}
                    disabled={i === stops.length - 1}
                    aria-label={`Move ${a.name} later`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Ico name="chevron-down" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onShowInMap(a.id)}
                    aria-label={`Show ${a.name} on the map`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
                  >
                    <Ico name="locate" size={13} />
                  </button>
                  <a
                    href={`https://maps.apple.com/?daddr=${a.lat},${a.lng}`}
                    className="rounded-md bg-[#2C6A46] px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    GO
                  </a>
                  <button
                    type="button"
                    onClick={() => onRemove(a.id)}
                    aria-label={`Remove ${a.name} from the route`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#8A928C] transition-colors hover:border-[#D8B3AC] hover:bg-[#FBF4F2] hover:text-[#B5372A]"
                  >
                    <Ico name="close" size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] leading-relaxed text-[#8A928C]">
          Straight-line hops, not drive time. Order is yours; nothing reorders it for you.
        </p>
        <div className="flex items-center gap-2">
          {stops.length > 1 && (
            <a
              href={appleMapsRouteUrl(stops)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
            >
              <Ico name="pin" size={13} />
              Open all in Maps
            </a>
          )}
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#8A928C] transition-colors hover:border-[#D8B3AC] hover:text-[#B5372A]"
          >
            Clear route
          </button>
        </div>
      </div>
    </>
  );
}
