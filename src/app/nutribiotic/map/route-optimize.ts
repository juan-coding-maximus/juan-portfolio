/**
 * The route as a graph problem, and nothing else. Two questions, both on a
 * distance matrix: where does a new stop cost the least to insert, and what
 * order visits every stop for the least total driving. Pure functions -- no
 * fetch, no state, no fabricated distance. drive-actions.ts supplies the real
 * matrix (OSRM's road network) or MapScreen falls back to haversineMatrix
 * below when the router is unreachable, the same honesty split routeDriveLegs
 * already draws for a single leg.
 *
 * Juan's ask 2026-08-23: dropping a stop into a route by hand always meant
 * "at the end." This is the graph-theory answer he asked for instead --
 * cheapest insertion for one new stop, nearest-neighbour-plus-2-opt for a
 * whole day's reorder -- both standard, both exact enough for the six to ten
 * stops a field day actually has.
 */

export type Matrix = number[][];

const R_MILES = 3958.8;

/** Straight-line miles, the same formula RoutePanel and the widget each carry
    their own copy of. A third copy here rather than an import: this module
    has to work with no network at all, including no import that could ever
    grow one. */
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(h));
}

/** The fallback matrix, always available, never a network call: every pair's
    straight-line distance. Worse than road distance for picking a gap or an
    order, but an honest "closest as the crow flies" beats blocking the add or
    silently leaving the router's failure unhandled. */
export function haversineMatrix(points: { lat: number; lng: number }[]): Matrix {
  return points.map((a) => points.map((b) => haversineMiles(a, b)));
}

/**
 * Where a new stop costs the least to add. `matrix` covers, in order:
 * [start?, ...stops (0..stopCount-1), end?, newStop] -- size
 * stopCount + (hasStart?1:0) + (hasEnd?1:0) + 1, the new stop always last.
 * Returns a gap index 0..stopCount to splice the new stop into the stops
 * array (0 = before the first stop, stopCount = after the last).
 */
export function cheapestGap(matrix: Matrix, stopCount: number, hasStart: boolean, hasEnd: boolean): number {
  if (stopCount === 0) return 0;
  const sOff = hasStart ? 1 : 0;
  const newIdx = matrix.length - 1;
  let best = 0;
  let bestCost = Infinity;
  for (let gap = 0; gap <= stopCount; gap++) {
    const leftIdx = gap === 0 ? (hasStart ? 0 : null) : sOff + gap - 1;
    const rightIdx = gap === stopCount ? (hasEnd ? sOff + stopCount : null) : sOff + gap;
    const toLeft = leftIdx === null ? 0 : matrix[leftIdx][newIdx];
    const toRight = rightIdx === null ? 0 : matrix[newIdx][rightIdx];
    const bridged = leftIdx !== null && rightIdx !== null ? matrix[leftIdx][rightIdx] : 0;
    const cost = toLeft + toRight - bridged;
    if (cost < bestCost) {
      bestCost = cost;
      best = gap;
    }
  }
  return best;
}

/**
 * The shortest order visiting every stop once, start and end pinned wherever
 * they're real. `matrix` covers, in order: [start?, ...stops (0..stopCount-1),
 * end?] -- size stopCount + (hasStart?1:0) + (hasEnd?1:0). Returns a
 * permutation of 0..stopCount-1 (indices into the ORIGINAL stops array).
 *
 * Nearest-neighbour builds a starting order, 2-opt repeatedly reverses a
 * sub-segment whenever that shortens the whole path, capped at 40 passes.
 * Both are the standard small-instance approach to an NP-hard problem: exact
 * would mean n! routes, and this converges on a field day's stop count in a
 * few milliseconds without ever needing to be exact.
 */
export function optimizedStopOrder(
  matrix: Matrix,
  stopCount: number,
  hasStart: boolean,
  hasEnd: boolean,
): number[] {
  if (stopCount <= 1) return stopCount === 1 ? [0] : [];

  const sOff = hasStart ? 1 : 0;
  const startIdx = hasStart ? 0 : null;
  const endIdx = hasEnd ? sOff + stopCount : null;
  const node = (stopIdx: number) => sOff + stopIdx;

  const unvisited = new Set(Array.from({ length: stopCount }, (_, i) => i));
  const nearestTo = (fromNode: number) =>
    [...unvisited].reduce((a, b) => (matrix[fromNode][node(a)] <= matrix[fromNode][node(b)] ? a : b));

  let current = startIdx !== null ? nearestTo(startIdx) : 0;
  const order: number[] = [current];
  unvisited.delete(current);
  while (unvisited.size) {
    current = nearestTo(node(current));
    order.push(current);
    unvisited.delete(current);
  }

  const pathCost = (o: number[]) => {
    let total = startIdx !== null ? matrix[startIdx][node(o[0])] : 0;
    for (let i = 0; i < o.length - 1; i++) total += matrix[node(o[i])][node(o[i + 1])];
    if (endIdx !== null) total += matrix[node(o[o.length - 1])][endIdx];
    return total;
  };

  let improved = true;
  let pass = 0;
  while (improved && pass < 40) {
    improved = false;
    pass++;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (pathCost(candidate) < pathCost(order) - 1e-6) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  return order;
}
