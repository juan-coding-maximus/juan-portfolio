"use server";

/**
 * Turning something Juan types ("hilton anaheim", "1234 Main St, Tustin") into
 * a stop with real coordinates.
 *
 * WHY A LOOKUP AND NOT A FREE-TEXT ADDRESS. A stop the route cannot place is a
 * stop with no GO button, no leg distance, and no pin, which is three quiet
 * holes in a list whose whole job is to be drivable. Google Places answers with
 * a formatted address and a location or it answers with nothing, and "nothing"
 * is reported as "could not find that" rather than saved as a stop that looks
 * fine until it is tapped in a parking lot.
 *
 * PLACES, NOT GEOCODING. Same NB_PLACES_API_KEY the account geocoder uses
 * (bridges/nutribiotic/geocode.py). The Geocoding API is not enabled on that
 * key, and Places is the better fit anyway: it resolves a business name, which
 * is how a lunch stop is actually thought of.
 *
 * NOTHING IS WRITTEN HERE. This reads Google and returns a candidate; the stop
 * only exists once Juan adds it, and it lives in his own route draft.
 */

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

/* Southern California, as a bias and not a fence. "Chipotle" typed on a phone
   in Irvine should not resolve to Denver, but Juan's book runs from Santa
   Barbara to San Diego and an occasional stop sits outside the box. */
const SOCAL_BIAS = {
  rectangle: {
    low: { latitude: 32.4, longitude: -119.6 },
    high: { latitude: 35.6, longitude: -115.9 },
  },
};

export type ResolvedPlace = { label: string; address: string; lat: number; lng: number };

type PlacesResponse = {
  places?: {
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }[];
};

export async function resolveStopAddress(
  query: string,
): Promise<{ ok: true; place: ResolvedPlace } | { ok: false; error: string }> {
  const q = query.trim();
  if (q.length < 3) return { ok: false, error: "Type an address or a place name." };

  const key = process.env.NB_PLACES_API_KEY;
  if (!key) return { ok: false, error: "Address lookup is not configured (NB_PLACES_API_KEY)." };

  let res: Response;
  try {
    res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: q,
        maxResultCount: 1,
        regionCode: "US",
        locationBias: SOCAL_BIAS,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach the address lookup. Try again." };
  }

  if (!res.ok) return { ok: false, error: `Address lookup failed (${res.status}).` };

  const data = (await res.json()) as PlacesResponse;
  const hit = data.places?.[0];
  const lat = hit?.location?.latitude;
  const lng = hit?.location?.longitude;
  if (!hit || typeof lat !== "number" || typeof lng !== "number") {
    return { ok: false, error: "No match. Add the city, or paste the full address." };
  }

  return {
    ok: true,
    place: {
      label: hit.displayName?.text?.trim() || hit.formattedAddress || q,
      address: hit.formattedAddress || q,
      lat,
      lng,
    },
  };
}
