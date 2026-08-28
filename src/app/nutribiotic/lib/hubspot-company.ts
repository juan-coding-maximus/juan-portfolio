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
import { batchRead, OWNER_ID, request } from "./hubspot";

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
 * is always Juan's: this path only ever runs when he is the one filing.
 *
 * hs_lead_status IS SET HERE, at birth, to NEW ("New to open"). The property
 * is pull-only everywhere else in this boundary (owner:hubspot in
 * hubspot_fields.json, never pushed by the sync worker), but CREATE is the
 * one documented exception hubspot_create_company.py already carved out:
 * there is no HQ judgment to overwrite because there is no record yet
 * (see that script's --lead-status, same reasoning). Every brand-new
 * company from the field starts life unworked, which is exactly what
 * "New to open" means. */
export async function createCompany(input: NewCompany): Promise<string> {
  const properties: Record<string, string> = {
    hubspot_owner_id: OWNER_ID,
    name: input.name,
    hs_lead_status: "NEW",
  };
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

/** Last 10 digits, the comparison NANP numbers actually survive: the same
 * number reaches this OS as (760) 555-0134, 760-555-0134 and +17605550134. */
function phoneDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "").slice(-10);
}

export type CompanyPhoneOutcome =
  | { status: "filled"; phone: string }
  | { status: "same" }
  /** The company has a DIFFERENT working number. Kept, never overwritten. */
  | { status: "conflict"; existing: string; offered: string }
  | { status: "skipped" };

/**
 * Blank-fill a company's `phone` from the number a contact just gave at the
 * door. Returns what it decided so the caller can show it rather than guess.
 *
 * WHY THIS EXISTS. A number collected in person is often the only working line
 * for a store whose ERP row carries a disconnected billing number, and until
 * now that number lived on the contact alone. A rep re-reading the company a
 * month later saw the dead number and called it.
 *
 * WHY BLANK-FILL AND NOT OVERWRITE. hubspot_fields.json declares
 * `companies.phone` as `owner: "hubspot"`, `push: "fill"` — HQ owns that cell,
 * and the 7 live disagreements found on 2026-08-02 all traced to the same ERP
 * import on both sides. Writing over it here would make this path contradict
 * the one declaration of field direction the department has, and would do it
 * from the phone, where nobody would see it happen. So: fill when empty, and
 * when both sides have a number and they differ, keep HQ's and report the
 * conflict. That is AGENTS.md HARD RULE 4 (nothing is deleted to make room)
 * applied to a cell HQ owns; the contact keeps its own number either way, so no
 * information is lost by declining to overwrite.
 *
 * Best-effort: this is enrichment hanging off a visit, never a gate on filing
 * it. Every failure returns "skipped" rather than throwing.
 */
export async function ensureCompanyPhone(
  companyId: string,
  phone: string | null | undefined,
): Promise<CompanyPhoneOutcome> {
  const offered = (phone ?? "").trim();
  if (!offered || phoneDigits(offered).length < 10) return { status: "skipped" };

  try {
    const live = await batchRead("companies", [companyId], ["phone"]);
    const existing = (live[0]?.properties?.phone ?? "").trim();

    if (existing) {
      if (phoneDigits(existing) === phoneDigits(offered)) return { status: "same" };
      return { status: "conflict", existing, offered };
    }

    await request({
      method: "PATCH",
      path: `/crm/v3/objects/companies/${companyId}`,
      body: { properties: { phone: offered } },
      entity: "companies",
      operation: "upsert",
    });
    return { status: "filled", phone: offered };
  } catch {
    return { status: "skipped" };
  }
}
