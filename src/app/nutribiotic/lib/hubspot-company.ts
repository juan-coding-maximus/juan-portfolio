/**
 * Creating the ONE HubSpot company a brand-new OS account has none of yet.
 * Port of bridges/nutribiotic/hubspot_create_company.py: read that file
 * first, this stays faithful to it rather than reimagined.
 *
 * WHOSE ACCOUNTS THIS TOUCHES. Portal 148711228 is shared: Juan's book is one
 * slice of it, Kyle Maxwell's is another, and some companies are unowned. A
 * SECOND company for a store one of them already has is a worse mistake than
 * any this department makes elsewhere, because there is no local record to
 * catch it: nb_accounts only holds Juan's book, so a store already on file
 * under Kyle or under no one is invisible to every OTHER matcher here. The
 * guard is a live, portal-wide search (name token + website domain, NOT
 * owner-filtered) that runs before every create. ANY hit blocks it.
 */

import "server-only";
import { OWNER_ID, request } from "./hubspot";

export type DuplicateCandidate = { id: string; name: string | null; city: string | null; owner: string | null };

/** Portal-wide, not owner-filtered. Juan's local book cannot see Kyle's
 * companies or the unowned ones, so this is the one check nothing else here
 * can do. A search failure is a Blocked, not a swallowed miss: creating
 * blind is exactly the risk this exists to prevent. */
export async function findPossibleDuplicates(name: string, website?: string | null): Promise<DuplicateCandidate[]> {
  const seen = new Map<string, DuplicateCandidate>();

  async function run(filters: Array<{ propertyName: string; operator: string; value: string }>) {
    const res = await request<{ results?: Array<{ id: string; properties?: Record<string, string | null> }> }>({
      method: "POST",
      path: "/crm/v3/objects/companies/search",
      body: { limit: 10, properties: ["name", "city", "hubspot_owner_id"], filterGroups: [{ filters }] },
      entity: "companies",
      operation: "search",
    });
    for (const r of res.results ?? []) {
      seen.set(r.id, {
        id: r.id,
        name: r.properties?.name ?? null,
        city: r.properties?.city ?? null,
        owner: r.properties?.hubspot_owner_id ?? null,
      });
    }
  }

  await run([{ propertyName: "name", operator: "CONTAINS_TOKEN", value: name }]);
  if (website) {
    const domain = website.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").trim().toLowerCase();
    if (domain) await run([{ propertyName: "domain", operator: "EQ", value: domain }]);
  }
  return Array.from(seen.values());
}

export type NewCompany = {
  name: string;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  website?: string | null;
};

/** Only name/city/state/phone/website, and only the ones that are actually
 * non-empty, same as hubspot_create_company.py's build_properties(). Owner
 * is always Juan's: this path only ever runs when he is the one filing. */
export async function createCompany(input: NewCompany): Promise<string> {
  const properties: Record<string, string> = { hubspot_owner_id: OWNER_ID, name: input.name };
  if (input.city) properties.city = input.city;
  if (input.state) properties.state = input.state;
  if (input.phone) properties.phone = input.phone;
  if (input.website) properties.website = input.website;

  const res = await request<{ id?: string }>({
    method: "POST",
    path: "/crm/v3/objects/companies",
    body: { properties },
    entity: "companies",
    operation: "create",
  });
  if (!res.id) throw new Error("HubSpot accepted the company but returned no id.");
  return res.id;
}
