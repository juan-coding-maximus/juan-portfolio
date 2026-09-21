import "server-only";
import type { LatLng } from "./osrm";
import PRICE_CACHE from "./carwash-prices.json";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.shortFormattedAddress",
  "places.location",
  "places.currentOpeningHours.openNow",
  "places.editorialSummary",
  "places.reviews",
].join(",");

type CachedTier = { name: string; tier: string; price: number; sourceUrl: string; verifiedAt: string };
const PRICES: Record<string, CachedTier> = PRICE_CACHE;

export type WashStation = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** The real posted dollar price for the cheapest tier confirmed to include
   *  both an outside/exterior machine wash and a free vacuum, from
   *  carwash-prices.json. Never a Google priceLevel bucket, never guessed:
   *  null when a place hasn't been looked up and verified yet. */
  price: number | null;
  /** The tier name that price applies to (e.g. "Basic", "Bronze"), when known. */
  tier: string | null;
  /** Where the price was verified, so it can be checked and refreshed. */
  priceSourceUrl: string | null;
  /** Only true when "drive-through" (or a clear paraphrase) appears in
   *  Places' own text for this place, never assumed from the search query. */
  driveThrough: boolean;
  /** True when a free vacuum is confirmed either by the price cache (its
   *  qualifying tier is only ever cached when the vacuum is free) or by
   *  Places' own text for this place. */
  freeVacuums: boolean;
};

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  currentOpeningHours?: { openNow?: boolean };
  editorialSummary?: { text?: string };
  reviews?: Array<{ text?: { text?: string } }>;
};

const DRIVE_THROUGH_RE = /drive[\s-]?(?:thru|through)/i;
const FREE_VACUUM_RE = /(free|complimentary)\s+vacuum|vacuums?\s+(?:are\s+|included\s+)?free/i;

/**
 * Car washes near one point. Unlike gas stations, Places (New) has no real
 * price field for `car_wash` places, so this uses Text Search (which matches
 * free text against name/description/review snippets) instead of Nearby
 * Search, biased to `center`. The real dollar price is never from Google:
 * it's looked up separately and cached in carwash-prices.json, keyed by
 * Places id. "Drive-through" and "free vacuums" are never inferred from the
 * query, only read back from Places' own editorial summary or review text
 * for that exact place, or confirmed directly when a price was verified.
 * Only a place confirmed on both counts, outside machine wash and free
 * vacuum, is returned at all.
 */
export async function carWashNearby(center: LatLng, radiusMeters: number): Promise<WashStation[]> {
  const key = process.env.NB_PLACES_API_KEY ?? "";
  if (!key) throw new Error("NB_PLACES_API_KEY is not configured on this deployment.");

  const res = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: "drive-through car wash free vacuums",
      includedType: "car_wash",
      maxResultCount: 20,
      languageCode: "en",
      regionCode: "US",
      locationBias: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(50_000, Math.max(500, radiusMeters)) },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Places HTTP ${res.status}`);

  const data = (await res.json()) as { places?: RawPlace[] };
  const out: WashStation[] = [];
  for (const p of data.places ?? []) {
    if (p.currentOpeningHours?.openNow === false) continue;
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (!p.id || lat == null || lng == null) continue;
    const text = [p.editorialSummary?.text, ...(p.reviews ?? []).map((r) => r.text?.text)].filter(Boolean).join(" \n ");
    const cached = PRICES[p.id];
    const driveThrough = Boolean(cached) || DRIVE_THROUGH_RE.test(text);
    const freeVacuums = Boolean(cached) || FREE_VACUUM_RE.test(text);
    if (!driveThrough || !freeVacuums) continue;
    out.push({
      id: p.id,
      name: p.displayName?.text ?? "Car wash",
      address: p.shortFormattedAddress ?? "",
      lat,
      lng,
      price: cached?.price ?? null,
      tier: cached?.tier ?? null,
      priceSourceUrl: cached?.sourceUrl ?? null,
      driveThrough,
      freeVacuums,
    });
  }
  return out;
}
