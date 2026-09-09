/**
 * The moment a prospect earns a portal record: the first touchpoint logged
 * against an account that has none.
 *
 * WHY THIS EXISTS. Juan, 2026-09-09: "Once a touchpoint is logged from a
 * prospect that doesn't previously have a HubSpot account, all of the
 * enrichments that has happened for that account immediately put through to the
 * HubSpot in its proper places." Until now runEngagement threw
 * `Blocked("... is not linked to a portal company. Linking is a human
 * decision.")` and the note dropped into the Visit tab's manual queue, so an
 * SDR-originated prospect he actually called had its call stranded in the OS
 * while the company, the address, the hours and the people he had just found
 * sat there with nobody in the shared portal able to see any of it.
 *
 * THIS IS THE GRADUATION HARD RULE 20 ALREADY DESCRIBES, not a new policy.
 * "A bulk-imported prospect earns its HubSpot record by being talked to, not by
 * existing... They graduate when a real touchpoint is logged through one of the
 * capture doors, and not before." That sentence had no code behind it on the
 * TypeScript side; `hubspot_sync_eligible` was written false by the ingests and
 * flipped true by nothing. This is the flip.
 *
 * WHAT IT KEEPS, ALL OF IT. Every rail createBusinessFromPlace already stands
 * on, in the same order:
 *   - synthetic origin refused, on the activity and on the account
 *   - a field note refused outright (HARD RULE 17: on 2026-09-02 four notes to
 *     self got companies invented to hold them)
 *   - owner asserted twice before anything is created, `owner_name` AND
 *     `hubspot_owner_id`, against the local row; runEngagement then asserts the
 *     live portal record via assertJuansBook before it files anything on it
 *   - a portal-wide duplicate search that is a HARD STOP, never auto-resolved.
 *     Juan's book cannot see Kyle's companies or the unowned ones, so this is
 *     the only check that can catch a second record for a store that already
 *     has one. Any hit and nothing is created; the candidates go back to the
 *     screen for a human (HARD RULE 3, a merge is always a human's call).
 *
 * WHAT IT PUSHES, WHICH IS THE NEW PART. Not just name/city/state/phone/
 * website: the street and zip too, then the hours the enricher found
 * (`nb_business_hours`, the one property with no auto-sync path, HARD RULE 14),
 * the ordering email, and every named person on file as a real HubSpot contact
 * associated to the new company. Juan, mid-build: "when there are multiple
 * contacts available, add them all. It's always best to have more names."
 *
 * `channel` IS DELIBERATELY NOT PUSHED. `nutribiotic/config/hubspot_fields.json`
 * declares no HubSpot property for it, and a property with no owner class there
 * is a property this boundary refuses to touch. Creating one is a schema change
 * to a portal shared with another rep and HQ, which is a separate decision with
 * its own gate, not something a touchpoint should do on its way past.
 */

import "server-only";
import {
  getAccountForGraduation,
  getActivityById,
  linkAccountHubspotCompany,
  linkContactHubspotId,
  listContacts,
  markHubspotSyncEligible,
  type Contact,
} from "./dal";
import { OWNER_ID, request } from "./hubspot";
import {
  createCompany,
  ensureCompanyDomainForEmail,
  findPossibleDuplicates,
  pushBusinessHours,
  pushCompanyEmail,
  type DuplicateCandidate,
} from "./hubspot-company";
import { checkAssociationLeak, isNeverFiledKind } from "./hubspot-engagement";

const OWNER_NAME = "Juan Arenas Martin";
const CONTACT_TO_COMPANY = 279;

export type GraduationOutcome =
  /** Nothing to do: already linked, or not a case this path handles. */
  | { status: "skipped"; reason: string }
  /** A company was created and everything on file was pushed onto it. */
  | {
      status: "created";
      companyId: string;
      accountId: string;
      accountName: string;
      hoursPushed: boolean;
      emailPushed: boolean;
      contactsFiled: string[];
      contactErrors: string[];
      leaks: number;
    }
  /** A human has to decide. Nothing was created. */
  | { status: "blocked"; reason: string; duplicates?: DuplicateCandidate[] };

function fullName(c: Contact): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

/**
 * File one OS contact as a HubSpot contact on the brand-new company.
 *
 * A NAME ALONE IS ENOUGH (HARD RULE 13): no phone or email required, and every
 * contact carries its `jobtitle` because the headhunter pass only writes a
 * person it can also state a role for. This is deliberately more permissive
 * than runEngagement's own contact-creation loop, which only files people the
 * touchpoint text itself named with a phone or an email; here the company is
 * being born and the whole point is that what the OS already knows arrives with
 * it.
 *
 * The association is read back afterwards. HubSpot auto-links a contact to any
 * company sharing its email domain, and on a chain domain that company is often
 * the other rep's (confirmed 2026-08-17, HARD RULE 2). Anything the code did
 * not ask for is detached and counted.
 */
async function fileContact(
  companyId: string,
  contact: Contact,
): Promise<{ id: string | null; leaks: number; error: string | null }> {
  const first = contact.first_name?.trim() || null;
  const last = contact.last_name?.trim() || null;
  if (!first && !last) return { id: null, leaks: 0, error: null };
  try {
    if (contact.email) await ensureCompanyDomainForEmail(companyId, contact.email);
    const res = await request<{ id?: string }>({
      method: "POST",
      path: "/crm/v3/objects/contacts",
      body: {
        properties: {
          ...(first ? { firstname: first } : {}),
          ...(last ? { lastname: last } : {}),
          ...(contact.phone ? { phone: contact.phone } : {}),
          ...(contact.email ? { email: contact.email } : {}),
          ...(contact.title ? { jobtitle: contact.title } : {}),
          hubspot_owner_id: OWNER_ID,
        },
        associations: [
          {
            to: { id: companyId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: CONTACT_TO_COMPANY }],
          },
        ],
      },
      entity: "contacts",
      operation: "create",
    });
    if (!res.id) return { id: null, leaks: 0, error: `HubSpot returned no id for ${fullName(contact)}.` };
    await linkContactHubspotId(contact.id, res.id);
    const stray = await checkAssociationLeak("contacts", res.id, companyId);
    return { id: res.id, leaks: stray.length, error: null };
  } catch (e) {
    // Enrichment hanging off a filing, never a gate on it: a contact that
    // fails to create must not cost the company or the note.
    return { id: null, leaks: 0, error: `${fullName(contact)}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Every refusal, in order, before anything is created. Returns the account when
 * it is clear to graduate. Shared by the real path and by previewGraduation, so
 * a dry run can never be checking a different set of rails than the live one.
 */
async function clearToGraduate(
  activity: { origin: string; kind: string; account_id: string | null } | null,
  activityId: number,
): Promise<{ ok: true; account: NonNullable<Awaited<ReturnType<typeof getAccountForGraduation>>> } | GraduationOutcome> {
  if (!activity) return { status: "skipped", reason: `no nb_activities row ${activityId}` };
  if (activity.origin === "synthetic") {
    return { status: "skipped", reason: "synthetic activity, never crosses into the shared portal" };
  }
  if (isNeverFiledKind(activity.kind || "")) {
    return { status: "skipped", reason: `kind '${activity.kind}' never reaches the portal (HARD RULE 17)` };
  }
  if (!activity.account_id) return { status: "skipped", reason: "activity has no account_id" };

  const account = await getAccountForGraduation(activity.account_id);
  if (!account) return { status: "skipped", reason: `no nb_accounts row ${activity.account_id}` };
  if (account.hubspot_company_id) {
    return { status: "skipped", reason: `already linked to portal company ${account.hubspot_company_id}` };
  }
  if (account.origin === "synthetic") {
    return { status: "skipped", reason: "synthetic account, never crosses into the shared portal" };
  }

  // HARD RULE 2, both halves of the local assertion. The live one runs in
  // runEngagement a moment later, against the record this just created.
  if ((account.owner_name ?? "") !== OWNER_NAME || String(account.hubspot_owner_id ?? "") !== OWNER_ID) {
    return {
      status: "blocked",
      reason:
        `account ${account.id} (${account.name}) is owned by '${account.owner_name || "(unowned)"}' ` +
        `/ owner id ${account.hubspot_owner_id || "(none)"}, not Juan's ${OWNER_ID}. Out of scope, nothing created.`,
    };
  }

  // HARD RULE 3. A hit is a stop, not a preference: creating a second company
  // for a store Kyle or HQ already has is invisible to every other matcher
  // here, because nb_accounts only holds Juan's book.
  const dupes = await findPossibleDuplicates(account.name, account.website);
  if (dupes.length > 0) {
    return {
      status: "blocked",
      reason:
        `${dupes.length} possible existing company match(es) in the portal for "${account.name}" ` +
        "(name or domain). Nothing created; the touchpoint stays in the OS until a human picks one.",
      duplicates: dupes,
    };
  }
  return { ok: true, account };
}

/**
 * What this account WOULD send, without sending it. Every read runs (scope,
 * duplicate search, the contacts on file); nothing is written.
 *
 * The department dry-runs every outward write before it makes it, and this path
 * has no CLI in front of it: it fires off a touchpoint. So the dry run is a
 * function, callable against any account, and it takes the account id directly
 * because there is no activity yet at the moment you want to check one.
 */
export async function previewGraduation(accountId: string): Promise<
  | { status: "would-create"; properties: Record<string, string>; hours: boolean; email: string | null; contacts: string[] }
  | GraduationOutcome
> {
  const gate = await clearToGraduate(
    { origin: "field", kind: "visit", account_id: accountId },
    -1,
  );
  if (!("ok" in gate)) return gate;
  const a = gate.account;
  const properties: Record<string, string> = { hubspot_owner_id: OWNER_ID, name: a.name, hs_lead_status: "NEW" };
  if (a.street) properties.address = a.street;
  if (a.postal) properties.zip = a.postal;
  if (a.city) properties.city = a.city;
  if (a.state) properties.state = a.state;
  if (a.phone) properties.phone = a.phone;
  if (a.website) properties.website = a.website;
  const contacts = await listContacts(a.id);
  return {
    status: "would-create",
    properties,
    hours: Boolean(a.business_hours && Object.keys(a.business_hours).length),
    email: (a.email ?? "").trim() || null,
    contacts: contacts.data
      .filter((c) => !c.hubspot_contact_id && c.origin !== "synthetic")
      .map((c) => `${fullName(c)}${c.title ? ` (${c.title})` : ""}${c.is_decision_maker ? " [DM]" : ""}`),
  };
}

/**
 * Give this activity's account a portal company if it has none, and carry
 * everything already enriched onto it. Called by autoFileEngagement BEFORE
 * runEngagement, so the note itself still files through the one normal path.
 *
 * Never throws. Every refusal is a returned status, because this runs inside a
 * touchpoint the human already recorded and nothing here may unwind it.
 */
export async function ensurePortalCompanyForActivity(activityId: number): Promise<GraduationOutcome> {
  try {
    const activity = await getActivityById(activityId);
    const gate = await clearToGraduate(activity, activityId);
    if (!("ok" in gate)) return gate;
    const account = gate.account;

    const companyId = await createCompany({
      name: account.name,
      street: account.street,
      postal: account.postal,
      city: account.city,
      state: account.state,
      phone: account.phone,
      website: account.website,
    });
    await linkAccountHubspotCompany(account.id, companyId, OWNER_ID, OWNER_NAME);
    // The HARD RULE 20 flip, after the link, never before it.
    await markHubspotSyncEligible(account.id);

    // Everything else the OS already knew, onto the record now rather than on
    // whichever later pass happens to cover that field.
    let hoursPushed = false;
    if (account.business_hours && Object.keys(account.business_hours).length > 0) {
      hoursPushed = (await pushBusinessHours(companyId, account.business_hours)) === "filled";
    }
    let emailPushed = false;
    if ((account.email ?? "").trim()) {
      emailPushed = (await pushCompanyEmail(companyId, account.email!.trim())) === "filled";
    }

    const contactsFiled: string[] = [];
    const contactErrors: string[] = [];
    let leaks = 0;
    const contacts = await listContacts(account.id);
    for (const c of contacts.data) {
      if (c.hubspot_contact_id) continue;
      if (c.origin === "synthetic") continue;
      const res = await fileContact(companyId, c);
      leaks += res.leaks;
      if (res.error) contactErrors.push(res.error);
      else if (res.id) contactsFiled.push(fullName(c));
    }

    return {
      status: "created",
      companyId,
      accountId: account.id,
      accountName: account.name,
      hoursPushed,
      emailPushed,
      contactsFiled,
      contactErrors,
      leaks,
    };
  } catch (e) {
    return { status: "blocked", reason: e instanceof Error ? e.message : String(e) };
  }
}
