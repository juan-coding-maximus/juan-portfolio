import { DISCOUNT_PER_GAL } from "./constants";

export type Station = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Regular unleaded, USD per gallon, as Google last saw it. */
  regular: number;
  updatedAt: string;
};

export type Scored = Station & {
  detourMinutes: number;
  afterDiscount: number;
  perGallon: number;
  total: number;
};

/**
 * Ranks stations by what the fill really costs: the pump price minus the
 * discount, plus every detour minute priced at `rate` per gallon bought.
 * A minute is worth more when there is more fuel to buy, which is exactly why
 * a long empty-tank drive is where this pays and a quarter-tank top-up isn't.
 */
export function scoreStations(
  stations: Station[],
  detourMinutes: number[],
  gallons: number,
  rate: number,
): Scored[] {
  const out: Scored[] = [];
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const detour = detourMinutes[i];
    if (!Number.isFinite(detour)) continue;
    const afterDiscount = s.regular - DISCOUNT_PER_GAL;
    const perGallon = afterDiscount + Math.max(0, detour) * rate;
    out.push({ ...s, detourMinutes: detour, afterDiscount, perGallon, total: perGallon * gallons });
  }
  out.sort((a, b) => a.total - b.total || a.detourMinutes - b.detourMinutes);
  return out;
}
