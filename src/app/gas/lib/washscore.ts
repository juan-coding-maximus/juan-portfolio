import type { WashStation } from "./carwash";

export type WashScored = WashStation & { detourMinutes: number; total: number };

/**
 * Ranks car washes the same way gas ranks stations: `total = price +
 * detourMinutes * rate`, ascending. `price` is the real posted dollar price
 * for the cheapest tier confirmed to include both an outside machine wash
 * and a free vacuum (carwash-prices.json), never a priceLevel bucket. Only
 * stations with a verified price are ranked, since there's nothing real to
 * rank a guess against.
 */
export function scoreCarWashes(stations: WashStation[], detourMinutes: number[], rate: number): WashScored[] {
  const out: WashScored[] = [];
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const detour = detourMinutes[i];
    if (!Number.isFinite(detour) || s.price == null) continue;
    out.push({ ...s, detourMinutes: detour, total: s.price + Math.max(0, detour) * rate });
  }
  out.sort((a, b) => a.total - b.total || a.detourMinutes - b.detourMinutes);
  return out;
}
