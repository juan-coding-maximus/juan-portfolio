/**
 * Google Places (New) Text Search, ported from bridges/nutribiotic/geocode.py.
 * Read that file first: same endpoint, same field mask, same API key
 * (NB_PLACES_API_KEY). This exists so a business a rep names for the first
 * time can be looked up from the phone, without his Mac.
 *
 * NO CORROBORATION LADDER HERE, unlike geocode.py. That script is validating
 * a fuzzy match against an address already on file; this is a fresh business
 * with nothing on file yet, so there is nothing to corroborate against. The
 * candidate is shown to Juan instead, and HIS confirmation is the check.
 */

import "server-only";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.regularOpeningHours.periods",
  "places.businessStatus",
].join(",");

export type PlaceCandidate = {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  businessStatus: string | null;
  businessHours: Record<string, string[][]> | null;
};

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ types?: string[]; longText?: string; shortText?: string }>;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;
  regularOpeningHours?: { periods?: Array<{ open?: { day?: number; hour?: number; minute?: number }; close?: { hour?: number; minute?: number } }> };
};

function component(place: RawPlace, kind: string): string | null {
  for (const c of place.addressComponents ?? []) {
    if ((c.types ?? []).includes(kind)) return c.longText || c.shortText || null;
  }
  return null;
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function openingHours(place: RawPlace): Record<string, string[][]> | null {
  const periods = place.regularOpeningHours?.periods ?? [];
  if (periods.length === 0) return null;
  const out: Record<string, string[][]> = Object.fromEntries(DAYS.map((d) => [d, []]));
  const fmt = (h?: number, m?: number) => `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
  for (const p of periods) {
    const day = p.open?.day;
    if (day == null) continue;
    out[DAYS[day]].push([fmt(p.open?.hour, p.open?.minute), p.close ? fmt(p.close.hour, p.close.minute) : "23:59"]);
  }
  return out;
}

/** "(657) 655-4420" -> "657-655-4420", the format every other nb_accounts.
 * phone is stored in (dashed, no country code). Anything that doesn't parse
 * as a US 10-digit number is passed through rather than mangled. */
function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").replace(/^1/, "");
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toCandidate(place: RawPlace): PlaceCandidate {
  return {
    placeId: place.id ?? "",
    name: place.displayName?.text ?? "",
    formattedAddress: place.formattedAddress ?? null,
    street: [component(place, "street_number"), component(place, "route")].filter(Boolean).join(" ") || null,
    city: component(place, "locality"),
    state: component(place, "administrative_area_level_1"),
    postal: component(place, "postal_code"),
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    phone: normalizePhone(place.nationalPhoneNumber),
    website: place.websiteUri ?? null,
    businessStatus: place.businessStatus ?? null,
    businessHours: openingHours(place),
  };
}

export class PlacesError extends Error {}

/**
 * California's bounding box, generous rather than exact (a rectangle can't
 * trace the state's real border, so this includes a thin sliver of NV/AZ/OR
 * near the line rather than risk clipping a real CA address). Juan's whole
 * book is Southern California; a CT/OH result is never useful and was
 * confirmed happening 2026-08-17 on a plain text search with no geographic
 * restriction at all.
 */
const CALIFORNIA_BOUNDS = {
  low: { latitude: 32.4, longitude: -124.6 },
  high: { latitude: 42.1, longitude: -114.0 },
};

/**
 * Radius for a proximity-biased search (Juan's ask 2026-08-26): a business
 * he's naming for the first time today is usually a few doors down from
 * wherever he already was, not somewhere else in the county. 15 miles is wide
 * enough to cover a whole cluster/day of driving without being so wide it
 * stops meaning anything.
 */
const NEAR_RADIUS_METERS = 24_140; // 15 miles

/**
 * Top few candidates for a free-text query ("XCEL Wellness, Huntington Beach, CA").
 *
 * `near`, when given, biases results toward that point (see dal.ts's
 * getLastVisitedLocationToday) with Places' `locationBias`, a soft nudge, not
 * a filter -- a real match named accurately still surfaces even if it's
 * outside the circle. Places' request accepts locationBias OR
 * locationRestriction, never both, so a caller with a bias point trades the
 * hard California rectangle for the soft circle; a caller with none keeps the
 * original county-wide restriction unchanged.
 */
export async function searchPlaces(
  query: string,
  maxResults = 3,
  near?: { lat: number; lng: number },
): Promise<PlaceCandidate[]> {
  const key = process.env.NB_PLACES_API_KEY ?? "";
  if (!key) throw new PlacesError("NB_PLACES_API_KEY is not configured on this deployment.");

  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: maxResults,
      languageCode: "en",
      regionCode: "US",
      ...(near
        ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: NEAR_RADIUS_METERS } } }
        : { locationRestriction: { rectangle: CALIFORNIA_BOUNDS } }),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new PlacesError(`Places HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { places?: RawPlace[] };
  return (data.places ?? []).map(toCandidate);
}
