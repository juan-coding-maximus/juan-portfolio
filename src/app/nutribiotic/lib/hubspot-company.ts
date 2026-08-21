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
import { assertJuansBook, batchRead, OWNER_ID, request, ScopeError } from "./hubspot";
import type { Tier } from "./dal";

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

/** Consumer webmail, never a company's own domain. Setting one as a `website`
 * would hand HubSpot a merge key shared by thousands of unrelated companies,
 * the exact failure DIRECTORY_HOSTS in hubspot.ts exists to prevent for
 * scraped links; this is the same danger from a contact's personal email. */
const FREEMAIL_HOSTS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com",
  "live.com", "msn.com", "protonmail.com", "me.com", "comcast.net", "verizon.net",
  "att.net", "sbcglobal.net",
]);

/**
 * Blank-fill a company's `website` from a contact's own email domain, before
 * that contact is created against it.
 *
 * WHY. HubSpot auto-associates a new contact to a company by matching the
 * contact's email domain against existing companies' `domain`. A company with
 * no `website`/`domain` yet has nothing to match, so HubSpot fabricates a
 * second, blank, unowned company from the domain and silently associates the
 * contact there instead, orphaning the real company (found live 2026-08-13,
 * Limitless Nutrition Zone: the contact landed on a nameless duplicate).
 * Filling `website` first gives HubSpot's own matcher something to find.
 *
 * Blank-fill only, same as every enrichment write in this department: a
 * company that already has a website keeps it untouched. Freemail is skipped
 * outright, see FREEMAIL_HOSTS.
 */
export async function ensureCompanyDomainForEmail(companyId: string, email: string | null | undefined): Promise<void> {
  const domain = (email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!domain || FREEMAIL_HOSTS.has(domain)) return;

  const live = await batchRead("companies", [companyId], ["website"]);
  if ((live[0]?.properties?.website ?? "").trim()) return;

  await request({
    method: "PATCH",
    path: `/crm/v3/objects/companies/${companyId}`,
    body: { properties: { website: domain } },
    entity: "companies",
    operation: "upsert",
  });
}

/** HubSpot's live dropdown options for potential__cloned_ ("Potential (new)"),
 * read verbatim from the portal 2026-08-21 (crm/v3/properties/companies/potential__cloned_).
 * The value sent must match one of these exactly or HubSpot rejects the write. */
const POTENTIAL_LABELS: Record<Tier, string> = {
  A: "A - very big",
  B: "B - big",
  C: "C - medium",
  D: "D - small",
  E: "E - very small",
  F: "F - no at all",
  G: "G - personal use through wholesale line",
};

export type PotentialPushResult =
  | { ok: true }
  | { ok: false; reason: "not_juans" | "not_configured" | "error"; error?: string };

/**
 * Juan's own potential read, pushed straight onto potential__cloned_ the moment
 * he sets a letter on the account card, overwriting whatever is there, HQ's
 * grade included. Juan's explicit call, 2026-08-21: potential__cloned_ is
 * owner:hubspot everywhere else in this department (the one field the sync
 * layer treats as pull-only), and grade_potential.py refuses on principle to
 * overwrite anything HQ set by hand, which is exactly the write this makes on
 * every tap. He chose it anyway, in full knowledge of both.
 *
 * Deliberately NOT wired into hubspot_fields.json / hubspot_sync.py's generic
 * `push`, which reads one local column per property and runs unattended across
 * the whole book every cycle: that would either push the already-equal
 * potential_hq mirror (a no-op) or push potential_juan for every account on a
 * schedule, not just the one Juan just graded. This is a single, human-
 * initiated write, same shape as createCompany/repairDerivedDomain above.
 *
 * Fires only when Juan SETS a letter, never on clear: toggling back to "defer
 * to HQ" locally must not blank a value HQ or Kyle can see in the portal.
 */
export async function pushPotentialRead(companyId: string, grade: Tier): Promise<PotentialPushResult> {
  try {
    const scope = await assertJuansBook([companyId]);
    if (scope.allowed.length === 0) return { ok: false, reason: "not_juans" };

    await request({
      method: "PATCH",
      path: `/crm/v3/objects/companies/${companyId}`,
      body: { properties: { potential__cloned_: POTENTIAL_LABELS[grade] } },
      entity: "companies",
      operation: "upsert",
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof ScopeError) return { ok: false, reason: "not_configured", error: e.message };
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
