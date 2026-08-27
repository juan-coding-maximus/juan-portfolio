"use server";

import { listAreaBoundaries as read, type TerritoryArea } from "./dal";

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
