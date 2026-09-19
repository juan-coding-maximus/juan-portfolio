import "server-only";
import type { LatLng } from "./osrm";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.shortFormattedAddress",
  "places.location",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.editorialSummary",
  "places.reviews",
].join(",");

export type PriceLevel =
  | "PRICE_LEVEL_FREE"
  | "PRICE_LEVEL_INEXPENSIVE"
  | "PRICE_LEVEL_MODERATE"
  | "PRICE_LEVEL_EXPENSIVE"
  | "PRICE_LEVEL_VERY_EXPENSIVE";

const VALID_PRICE_LEVELS = new Set<string>([
  "PRICE_LEVEL_FREE",
  "PRICE_LEVEL_INEXPENSIVE",
  "PRICE_LEVEL_MODERATE",
  "PRICE_LEVEL_EXPENSIVE",
  "PRICE_LEVEL_VERY_EXPENSIVE",
]);

export type WashStation = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Only set when Google itself returns a price level for this place. */
  priceLevel: PriceLevel | null;
  /** Only true when "drive-through" (or a clear paraphrase) appears in
   *  Places' own text for this place, never assumed from the search query. */
  driveThrough: boolean;
  /** Same rule as driveThrough: corroborated by Places' own text, or false. */
  freeVacuums: boolean;
};

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  editorialSummary?: { text?: string };
  reviews?: Array<{ text?: { text?: string } }>;
};

const DRIVE_THROUGH_RE = /drive[\s-]?(?:thru|through)/i;
const FREE_VACUUM_RE = /(free|complimentary)\s+vacuum|vacuums?\s+(?:are\s+|included\s+)?free/i;

/**
 * Car washes near one point. Unlike gas stations, Places (New) has no price
 * field and no drive-through/vacuum field for `car_wash` places, so this
 * uses Text Search (which matches free text against name/description/review
 * snippets) instead of Nearby Search, biased to `center`. `priceLevel` is
 * read straight off the response when Google has one; "drive-through" and
 * "free vacuums" are never inferred from the query, only read back from
 * Places' own editorial summary or review text for that exact place.
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
    out.push({
      id: p.id,
      name: p.displayName?.text ?? "Car wash",
      address: p.shortFormattedAddress ?? "",
      lat,
      lng,
      priceLevel: VALID_PRICE_LEVELS.has(p.priceLevel ?? "") ? (p.priceLevel as PriceLevel) : null,
      driveThrough: DRIVE_THROUGH_RE.test(text),
      freeVacuums: FREE_VACUUM_RE.test(text),
    });
  }
  return out;
}
