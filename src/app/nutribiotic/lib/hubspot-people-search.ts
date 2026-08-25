"use server";

/**
 * THE CALL SEARCHER (2026-08-25). Juan's ask: typing a name into the route
 * panel's "Add a call" field should search the shared HubSpot portal for
 * BOTH a contact and a company in the same box (typing "Amanda" finds a
 * person, typing "Whole Foods" finds an account), and picking a result
 * should fill the phone field too.
 *
 * PORTAL-WIDE, NOT OWNER-FILTERED. This is a read, not a write: findPossible
 * Duplicates (hubspot-company.ts) and findContactByPhone (hubspot-engagement.ts)
 * are both portal-wide searches for the same reason -- Juan's local nb_
 * tables only hold his own book, so a search scoped to it would be blind to
 * a contact or company that belongs to Kyle or to no one, which is exactly
 * the case where a phone number is worth surfacing before a call. AGENTS.md
 * hard rule 2 ("Juan's book only, asserted twice") governs OUTWARD WRITES;
 * nothing here writes anything.
 *
 * PHONE, WITH ONE FALLBACK EACH WAY. A contact with no phone of its own
 * falls back to its associated company's; a company with no phone of its
 * own falls back to one of its contacts'. Never both directions confused
 * with each other, and never a number invented when neither side has one --
 * the call still gets added, just with an empty phone field to fill by hand,
 * same as searching for nothing at all.
 */

import { batchRead, request } from "./hubspot";

export type HubspotCallCandidate = {
  id: string;
  kind: "contact" | "company";
  label: string;
  phone: string | null;
  /** Set only when the phone came from the OTHER object, not this one, so the
   *  UI can say "via <company>" rather than implying it's this contact's own
   *  direct line. */
  phoneVia: string | null;
};

type SearchHit = { id: string; properties?: Record<string, string | null> };

/** HubSpot's phone property is free text (Juan's own dialed formats, Places
 *  imports, whatever a rep typed years ago). Normalized to the one shape
 *  prettyPhone() in lib/ui.tsx knows how to display; a number that isn't a
 *  clean 10-digit US number is returned as-is rather than dropped, since an
 *  odd-shaped number is still worth having on the call. */
function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let d = trimmed.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length === 10) return `+1${d}`;
  return trimmed;
}

export async function searchHubspotForCall(query: string): Promise<HubspotCallCandidate[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  let contacts: SearchHit[] = [];
  let companies: SearchHit[] = [];
  try {
    const [contactsRes, companiesRes] = await Promise.all([
      request<{ results?: SearchHit[] }>({
        method: "POST",
        path: "/crm/v3/objects/contacts/search",
        body: {
          limit: 6,
          properties: ["firstname", "lastname", "phone", "associatedcompanyid"],
          // Two filter GROUPS, not two filters in one group: HubSpot ANDs
          // within a group and ORs across groups, and "Amanda" has to match
          // firstname OR lastname, not both at once.
          filterGroups: [
            { filters: [{ propertyName: "firstname", operator: "CONTAINS_TOKEN", value: q }] },
            { filters: [{ propertyName: "lastname", operator: "CONTAINS_TOKEN", value: q }] },
          ],
        },
        entity: "contacts",
        operation: "search",
      }),
      request<{ results?: SearchHit[] }>({
        method: "POST",
        path: "/crm/v3/objects/companies/search",
        body: {
          limit: 6,
          properties: ["name", "phone"],
          filterGroups: [{ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: q }] }],
        },
        entity: "companies",
        operation: "search",
      }),
    ]);
    contacts = contactsRes.results ?? [];
    companies = companiesRes.results ?? [];
  } catch {
    // HubSpot unreachable or unconfigured: the field still works, it just
    // has nothing to suggest, same as searchRouteAddresses degrading to [].
    return [];
  }

  // Contact -> company phone fallback: associatedcompanyid comes back for
  // free on the search above (a default HubSpot contact property), so this
  // is one batch read, not one call per contact.
  const companyIdsNeeded = Array.from(
    new Set(
      contacts
        .filter((c) => !c.properties?.phone && c.properties?.associatedcompanyid)
        .map((c) => c.properties!.associatedcompanyid as string),
    ),
  );
  const companyPhoneById = new Map<string, string | null>();
  const companyNameById = new Map<string, string | null>();
  if (companyIdsNeeded.length > 0) {
    try {
      const rows = await batchRead("companies", companyIdsNeeded, ["phone", "name"]);
      for (const r of rows) {
        companyPhoneById.set(r.id, r.properties?.phone ?? null);
        companyNameById.set(r.id, r.properties?.name ?? null);
      }
    } catch {
      // Fallback lookup failing is not fatal to the search itself; the
      // contact still appears, just without a company-sourced phone.
    }
  }

  const contactResults: HubspotCallCandidate[] = contacts.map((c) => {
    const first = c.properties?.firstname ?? "";
    const last = c.properties?.lastname ?? "";
    const name = [first, last].filter(Boolean).join(" ").trim() || "(no name)";
    const ownPhone = toE164(c.properties?.phone);
    const companyId = c.properties?.associatedcompanyid ?? null;
    const fallbackRaw = ownPhone || !companyId ? null : companyPhoneById.get(companyId) ?? null;
    return {
      id: c.id,
      kind: "contact",
      label: name,
      phone: ownPhone ?? toE164(fallbackRaw),
      phoneVia: ownPhone ? null : fallbackRaw ? companyNameById.get(companyId!) ?? "their company" : null,
    };
  });

  // Company -> a contact's phone fallback: no free-ride property for this
  // direction, so it costs one associations call per company that needs it
  // (only companies with no phone of their own, capped at 6 by the search
  // limit above, so this is at most a handful of extra requests).
  const companiesNeedingContactPhone = companies.filter((co) => !co.properties?.phone);
  const contactFallbackByCompany = new Map<string, { phone: string; name: string } | null>();
  if (companiesNeedingContactPhone.length > 0) {
    await Promise.all(
      companiesNeedingContactPhone.map(async (co) => {
        try {
          const assoc = await request<{ results?: Array<{ toObjectId?: number; id?: string }> }>({
            method: "GET",
            path: `/crm/v4/objects/companies/${co.id}/associations/contacts`,
            entity: "companies",
            operation: "read",
          });
          const contactIds = (assoc.results ?? [])
            .map((r) => (r.toObjectId !== undefined ? String(r.toObjectId) : r.id))
            .filter((x): x is string => Boolean(x))
            .slice(0, 5);
          if (contactIds.length === 0) return;
          const rows = await batchRead("contacts", contactIds, ["phone", "firstname", "lastname"]);
          const withPhone = rows.find((r) => r.properties?.phone);
          if (!withPhone?.properties?.phone) return;
          const name = [withPhone.properties.firstname, withPhone.properties.lastname]
            .filter(Boolean)
            .join(" ")
            .trim();
          contactFallbackByCompany.set(co.id, { phone: withPhone.properties.phone, name: name || "a contact" });
        } catch {
          // One company's association lookup failing does not sink the rest.
        }
      }),
    );
  }

  const companyResults: HubspotCallCandidate[] = companies.map((co) => {
    const ownPhone = toE164(co.properties?.phone);
    const fallback = ownPhone ? null : contactFallbackByCompany.get(co.id) ?? null;
    return {
      id: co.id,
      kind: "company",
      label: co.properties?.name ?? "(no name)",
      phone: ownPhone ?? toE164(fallback?.phone ?? null),
      phoneVia: ownPhone ? null : fallback ? fallback.name : null,
    };
  });

  return [...contactResults, ...companyResults];
}
