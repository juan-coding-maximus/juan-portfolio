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
  priceAgeHours: number | null;
  stale: boolean;
};

/* A GasBuddy-sourced price this old has already moved: a station shown here
   33h stale at $5.15 was $6.19 at the pump. Past 12h it loses 2c/gal per
   extra hour in the ranking (capped at $1/gal) so a fresher, close price
   wins instead of a stale "cheapest". */
const STALE_HOURS = 12;
const STALE_PENALTY_PER_HOUR = 0.02;
const STALE_PENALTY_CAP = 1.0;

function priceAgeHours(updatedAt: string): number | null {
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 3_600_000) : null;
}

function stalenessPenalty(ageHours: number | null): number {
  if (ageHours == null || ageHours <= STALE_HOURS) return 0;
  return Math.min(STALE_PENALTY_CAP, (ageHours - STALE_HOURS) * STALE_PENALTY_PER_HOUR);
}

/**
 * Ranks stations by what the fill really costs: the pump price minus the
 * discount, plus a staleness penalty for an old price, plus every detour
 * minute priced at `rate` per gallon bought. A minute is worth more when
 * there is more fuel to buy, which is exactly why a long empty-tank drive is
 * where this pays and a quarter-tank top-up isn't.
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
    const ageHours = priceAgeHours(s.updatedAt);
    const afterDiscount = s.regular - DISCOUNT_PER_GAL;
    const perGallon = afterDiscount + stalenessPenalty(ageHours) + Math.max(0, detour) * rate;
    out.push({
      ...s,
      detourMinutes: detour,
      afterDiscount,
      perGallon,
      total: perGallon * gallons,
      priceAgeHours: ageHours,
      stale: ageHours != null && ageHours > STALE_HOURS,
    });
  }
  out.sort((a, b) => a.total - b.total || a.detourMinutes - b.detourMinutes);
  return out;
}
