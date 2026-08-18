"use server";

/**
 * Road time between consecutive stops on the hand-built route.
 *
 * WHY THIS EXISTS AT ALL. RoutePanel shipped deliberately without drive time
 * (2026-08-05): there was no routing service wired to this screen, and a
 * straight-line mile count dressed up as a drive estimate is worse than no
 * estimate, because it is read as one. That reasoning has not changed. What
 * changed is that there is now a real road router behind the number.
 *
 * WHY OSRM AND NOT GOOGLE ROUTES. The Routes API is not enabled on the project
 * behind NB_PLACES_API_KEY (verified 2026-08-17: computeRouteMatrix returns
 * PERMISSION_DENIED), and its matrix pricing is per element, so a twelve-stop
 * route would bill on every render of a screen Juan reloads all day. OSRM's
 * public server is free, needs no key, and routes on the real street network.
 *
 * WHAT THE NUMBER HONESTLY IS, and this must stay on the screen next to it:
 * OSRM returns FREE-FLOW time. It knows the roads; it does not know the 405 at
 * 08:00. So the raw duration is multiplied by TRAFFIC_FACTOR and labelled as a
 * planning estimate, never as an ETA. When a live-traffic source is wired in,
 * the factor goes and the label changes with it.
 *
 * FAILURE IS SILENT AND VISIBLE AT ONCE: a null return means the panel falls
 * back to the straight-line hops it has always shown and says the drive times
 * are unavailable. It never invents a leg. A day plan with a fabricated
 * fifteen-minute leg in it is exactly the failure principle 2 exists to stop.
 */

const OSRM = "https://router.project-osrm.org/route/v1/driving";

/* LA surface-street and freeway reality against OSRM's free-flow model, in the
   09:00-16:00 window this screen plans for. Calibrated on 2026-08-17 against
   known South Bay legs. It is one number doing the work of a traffic model,
   which is why the screen says "planning estimate" rather than "ETA". */
const TRAFFIC_FACTOR = 1.35;

/* Above this many stops the URL and the shared router both get unreasonable.
   A field day is six to ten stops; twenty-five is a ceiling, not a target. */
const MAX_STOPS = 25;

export type DriveLeg = { minutes: number; miles: number };

export async function routeDriveLegs(
  points: { lat: number; lng: number }[],
): Promise<DriveLeg[] | null> {
  if (points.length < 2 || points.length > MAX_STOPS) return null;
  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) return null;

  /* One call for the whole path with steps off: OSRM returns a leg per
     consecutive pair, which is exactly the shape the panel renders. A table
     call would return every pair and we would throw away all but the diagonal. */
  const path = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM}/${path}?overview=false&annotations=false`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data: { code?: string; routes?: { legs?: { duration?: number; distance?: number }[] }[] };
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (data.code !== "Ok") return null;

  const legs = data.routes?.[0]?.legs;
  if (!legs || legs.length !== points.length - 1) return null;

  const out: DriveLeg[] = [];
  for (const l of legs) {
    if (typeof l.duration !== "number" || typeof l.distance !== "number") return null;
    out.push({
      minutes: (l.duration * TRAFFIC_FACTOR) / 60,
      miles: l.distance / 1609.344,
    });
  }
  return out;
}
