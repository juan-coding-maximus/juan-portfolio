"use server";

/**
 * The new-business path off a needs_account touchpoint (Visit tab). Juan
 * names a store that was not in the book, this looks it up on Google Places,
 * and once he confirms the right one, creates the OS account, the HubSpot
 * company (dedupe-checked portal-wide first), and files the visit he already
 * recorded against it, all in one flow, so a first-time stop takes one more
 * tap instead of a trip to the Clients screen later.
 */

import { revalidatePath } from "next/cache";
import { insertAccount, linkAccountHubspotCompany } from "./dal";
import { createCompany, findPossibleDuplicates, type DuplicateCandidate } from "./hubspot-company";
import { OWNER_ID } from "./hubspot";
import { searchPlaces, type PlaceCandidate } from "./places";
import { resolveTouchpointToAccount } from "./touchpoint";

export type BusinessSearchOutcome = { ok: true; candidates: PlaceCandidate[] } | { ok: false; error: string };

export async function searchNewBusiness(query: string): Promise<BusinessSearchOutcome> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Type a business name to search." };
  try {
    const candidates = await searchPlaces(q);
    if (candidates.length === 0) return { ok: false, error: `No Google Places result for "${q}".` };
    return { ok: true, candidates };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type CreateBusinessOutcome =
  | {
      ok: true;
      accountId: string;
      accountName: string;
      companyId: string;
      summary: string;
      peopleAdded: number;
      peopleUpdated: number;
      calendarProposals: number;
    }
  | { ok: false; error: string; duplicates?: DuplicateCandidate[] };

/**
 * `force` is the same escape hatch hubspot_create_company.py's --force is:
 * only reached after Juan has looked at the printed duplicate candidates on
 * screen and confirmed none of them is actually this store. Never the
 * default path.
 */
export async function createBusinessFromPlace(
  touchpointId: string,
  place: PlaceCandidate,
  opts: { force?: boolean } = {},
): Promise<CreateBusinessOutcome> {
  try {
    const dupes = await findPossibleDuplicates(place.name, place.website);
    if (dupes.length > 0 && !opts.force) {
      return {
        ok: false,
        error: `${dupes.length} possible existing company match(es) already in the portal (name or domain). Nothing created.`,
        duplicates: dupes,
      };
    }

    const account = await insertAccount({
      name: place.name,
      street: place.street,
      city: place.city,
      state: place.state,
      postal: place.postal,
      lat: place.lat,
      lng: place.lng,
      phone: place.phone,
      website: place.website,
      business_hours: place.businessHours,
    });

    const companyId = await createCompany({
      name: place.name,
      city: place.city,
      state: place.state,
      phone: place.phone,
      website: place.website,
    });

    await linkAccountHubspotCompany(account.id, companyId, OWNER_ID, "Juan Arenas Martin");

    const filed = await resolveTouchpointToAccount(touchpointId, account.id, account.name);
    if (!filed.ok) {
      // The account and company exist even though filing the visit failed;
      // say both things rather than hiding the partial success.
      return {
        ok: false,
        error: `Created the account and HubSpot company, but filing the visit failed: ${filed.error}. Add it by hand from the account profile.`,
      };
    }

    revalidatePath("/nutribiotic/visit");
    return {
      ok: true,
      accountId: account.id,
      accountName: account.name,
      companyId,
      summary: filed.summary,
      peopleAdded: filed.peopleAdded,
      peopleUpdated: filed.peopleUpdated,
      calendarProposals: filed.calendarProposals,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
