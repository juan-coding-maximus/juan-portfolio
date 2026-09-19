import type { PriceLevel, WashStation } from "./carwash";

export type WashScored = WashStation & { detourMinutes: number };

const PRICE_RANK: Record<PriceLevel, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const PRICE_LABEL: Record<PriceLevel, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "Inexpensive",
  PRICE_LEVEL_MODERATE: "Moderate",
  PRICE_LEVEL_EXPENSIVE: "Expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "Very expensive",
};

export function priceLevelLabel(level: PriceLevel | null): string | null {
  return level ? PRICE_LABEL[level] : null;
}

/**
 * Ranks car washes on the one signal every result has, detour minutes, since
 * Places has no dollar price for a car wash the way it does for gas. A place
 * within 3 minutes of the closest one is treated as a tie and broken by
 * priceLevel when Google returned one; a place with no priceLevel never gets
 * penalized for the gap, it just falls back to the detour order.
 */
export function scoreCarWashes(stations: WashStation[], detourMinutes: number[]): WashScored[] {
  const out: WashScored[] = [];
  for (let i = 0; i < stations.length; i++) {
    const detour = detourMinutes[i];
    if (!Number.isFinite(detour)) continue;
    out.push({ ...stations[i], detourMinutes: detour });
  }
  out.sort((a, b) => {
    const d = a.detourMinutes - b.detourMinutes;
    if (Math.abs(d) > 3) return d;
    const pa = a.priceLevel ? PRICE_RANK[a.priceLevel] : 2.5;
    const pb = b.priceLevel ? PRICE_RANK[b.priceLevel] : 2.5;
    return pa - pb || d;
  });
  return out;
}
