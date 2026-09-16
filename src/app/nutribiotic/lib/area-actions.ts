"use server";

import { listAreaBoundaries as read, listAreas, type TerritoryArea } from "./dal";

/**
 * The frontier polygons, on demand.
 *
 * A server action rather than part of the map page's payload: they are only
 * needed if Juan picks an area chip, which most page views never do, and they
 * are the single heaviest thing this screen could ship. See dal.ts's listAreas
 * for why they left the default select.
 */
export async function listAreaBoundaries(): Promise<Array<Pick<TerritoryArea, "id" | "boundary">>> {
  return read();
}

/** Ray casting, standard point-in-polygon: crosses the ring's edges from the
 * point out to infinity and counts the crossings. Odd means inside. `pt` and
 * every ring point are [lng, lat], GeoJSON's own order. */
function pointInRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** polygon[0] is the exterior ring, any further rings are holes. */
function pointInPolygon(pt: [number, number], polygon: number[][][]): boolean {
  if (polygon.length === 0 || !pointInRing(pt, polygon[0])) return false;
  for (let k = 1; k < polygon.length; k++) {
    if (pointInRing(pt, polygon[k])) return false;
  }
  return true;
}

/**
 * Which of Juan's 16 named territory areas a point falls in, for a business
 * that is not an account yet (a fresh Places candidate) and so has no
 * `nb_accounts.area` of its own to read. Same boundary source assign_areas.py
 * derives from the real book by Voronoi tessellation (see dal.ts's
 * TerritoryArea doc), just tested point-in-polygon instead of read off a row.
 * Null when the point lands outside every drawn frontier (Juan's whole book
 * is Southern California; a candidate this far off is a real gap, not a bug
 * to paper over with a nearest-area guess).
 */
export async function getAreaForPoint(lat: number, lng: number): Promise<{ id: string; label: string } | null> {
  const [areas, boundaries] = await Promise.all([listAreas(), read()]);
  const labelById = new Map(areas.map((a) => [a.id, a.label]));
  const pt: [number, number] = [lng, lat];
  for (const b of boundaries) {
    if (!b.boundary) continue;
    for (const polygon of b.boundary.coordinates) {
      if (pointInPolygon(pt, polygon)) {
        return { id: b.id, label: labelById.get(b.id) ?? b.id };
      }
    }
  }
  return null;
}
