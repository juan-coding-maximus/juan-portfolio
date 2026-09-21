import "server-only";
import type { Station } from "./score";

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.shortFormattedAddress",
  "places.location",
  "places.fuelOptions",
  "places.currentOpeningHours.openNow",
].join(",");

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  currentOpeningHours?: { openNow?: boolean };
  fuelOptions?: {
    fuelPrices?: Array<{
      type?: string;
      price?: { units?: string; nanos?: number };
      updateTime?: string;
    }>;
  };
};

/* Warehouse-club pumps need a membership card at the pump, so their price is
   not a price Juan can pay. Delete the pattern if he ever joins one. */
const MEMBERS_ONLY = /costco|sam[’']?s club/i;

/* Juan's own stated brand tendency, not verified per-station data: Arco and
   Unocal run cheap where he drives, Chevron never does. Verified live
   against this endpoint near Home on 2026-09-20: Arco was 9 of 20 results
   and posted the lowest real price in the set ($5.90 vs $6.40 Chevron), no
   coverage gap. "Unocal" is a defunct retail brand, its stations are "76"
   today, so there's nothing distinct left to sample for it. Since a real
   observed price already surfaces the cheap brands correctly, no brand
   scoring adjustment is applied, that would risk overriding an actual
   price with an assumption. */

/** Gas stations around one point, keeping only those Google has a live
 *  regular-unleaded price for. A station with no price is not a candidate:
 *  showing it would mean inventing a number. Closed stations are dropped. */
export async function fuelNearby(
  center: { lat: number; lng: number },
  radiusMeters: number,
): Promise<Station[]> {
  const key = process.env.NB_PLACES_API_KEY ?? "";
  if (!key) throw new Error("NB_PLACES_API_KEY is not configured on this deployment.");

  const res = await fetch(NEARBY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      includedTypes: ["gas_station"],
      maxResultCount: 20,
      languageCode: "en",
      regionCode: "US",
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(50_000, Math.max(500, radiusMeters)) },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Places HTTP ${res.status}`);

  const data = (await res.json()) as { places?: RawPlace[] };
  const out: Station[] = [];
  for (const p of data.places ?? []) {
    if (p.currentOpeningHours?.openNow === false) continue;
    if (MEMBERS_ONLY.test(p.displayName?.text ?? "")) continue;
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (!p.id || lat == null || lng == null) continue;
    const reg = (p.fuelOptions?.fuelPrices ?? []).find((f) => f.type === "REGULAR_UNLEADED");
    if (!reg?.price?.units) continue;
    const regular = Number(reg.price.units) + (reg.price.nanos ?? 0) / 1e9;
    if (!Number.isFinite(regular) || regular <= 0) continue;
    out.push({
      id: p.id,
      name: p.displayName?.text ?? "Gas station",
      address: p.shortFormattedAddress ?? "",
      lat,
      lng,
      regular,
      updatedAt: reg.updateTime ?? "",
    });
  }
  return out;
}
