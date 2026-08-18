/**
 * Carrying one logged activity across the HubSpot boundary as a Note, Call, or
 * Meeting, and naming the profile diffs it implies. Port of
 * bridges/nutribiotic/hubspot_notes.py + hubspot_push_contact.py's
 * create_contact/find_contact_by_phone, kept faithful to that file rather than
 * reimagined: read that file before changing this one.
 *
 * WHY A SECOND COPY OF THIS LOGIC. hubspot_notes.py runs on Juan's Mac, which
 * is not reachable from a phone in the field talking to the deployed app.
 * lib/hubspot.ts was already built for exactly this (see its own docstring);
 * this is the business logic that sits on top of it, so a touchpoint typed or
 * recorded from the Visit tab can reach the portal without his laptop.
 *
 * AUTO-FILED, SAME AS THE CLI. The clientos skill has Claude read a dry run
 * and re-issue with --write in the same turn, hands-off, because Juan already
 * asked for hands-off; lib/touchpoint.ts now does the equivalent for the
 * Visit tab, calling runEngagement(write:true) itself the moment an activity
 * is logged (typed note, recorded visit, or a just-created new business), no
 * click. previewEngagement()/fileEngagement() below still exist for the
 * Visit tab's "Ready to file to HubSpot" queue, which is now only a retry
 * path: an activity lands there when the automatic file failed (scope block,
 * missing company link, HubSpot error), so Juan can read why and push it
 * through by hand, same as the enrichment auto-filer's own failure card.
 *
 * WHAT IT WILL NOT DO, same as the Python original:
 *   - Overwrite a populated HubSpot property. A disagreement is a proposal,
 *     never an automatic write.
 *   - Create or merge a company.
 *   - Write anything the rep didn't say. The note body is the touchpoint's
 *     own hubspot_summary (a condensed rewrite made ONCE, at extraction time
 *     in touchpoint.ts, under the same no-fabrication rule as the verbatim
 *     `detail` the OS keeps) or, for activities parsed before that field
 *     existed, the verbatim detail itself. This module does no summarizing
 *     or inference of its own; it only assembles what extraction already
 *     produced plus outcome/kind/at/contacts nb_contacts already has.
 *   - File a synthetic activity into the shared portal.
 */

import "server-only";
import {
  getAccountForEngagement,
  getActivityById,
  getTouchpointParsedForActivity,
  linkContactHubspotId,
  listContacts,
  readConfig,
  stampActivityEngagementId,
  type Contact,
  type EngagementActivity,
} from "./dal";
import { assertJuansBook, OWNER_ID, request } from "./hubspot";
import { ensureCompanyDomainForEmail } from "./hubspot-company";

export class Blocked extends Error {}

// ---------------------------------------------------------------------------
// constants, ported verbatim from hubspot_notes.py / hubspot_push_contact.py
// ---------------------------------------------------------------------------

const NOTE_TO_COMPANY = 190;
const NOTE_TO_CONTACT = 202;
const CALL_TO_COMPANY = 182;
const CALL_TO_CONTACT = 194;
const MEETING_TO_COMPANY = 188;
const MEETING_TO_CONTACT = 200;
const CONTACT_TO_COMPANY = 279;

type EngagementType = "NOTE" | "CALL" | "MEETING";

const ENGAGEMENT_OBJECT: Record<EngagementType, string> = { NOTE: "notes", CALL: "calls", MEETING: "meetings" };
const ENGAGEMENT_TO_COMPANY: Record<EngagementType, number> = {
  NOTE: NOTE_TO_COMPANY,
  CALL: CALL_TO_COMPANY,
  MEETING: MEETING_TO_COMPANY,
};
const ENGAGEMENT_TO_CONTACT: Record<EngagementType, number> = {
  NOTE: NOTE_TO_CONTACT,
  CALL: CALL_TO_CONTACT,
  MEETING: MEETING_TO_CONTACT,
};

// HubSpot's own fixed hs_call_disposition GUIDs (external_options, not listed
// via the properties endpoint; confirmed live 2026-08-06). The nb outcome
// enum is coarser than HubSpot's six dispositions: every outcome implying
// someone answered maps to Connected, only no_answer gets its own.
const CALL_DISPOSITION_CONNECTED = "f240bbac-87c9-4f6e-bf70-924b57d47db7";
const CALL_DISPOSITION_NO_ANSWER = "73a0d17f-1163-4015-bdd5-ec830791da20";
const CALL_DISPOSITION: Record<string, string> = {
  reached: CALL_DISPOSITION_CONNECTED,
  no_decision_maker: CALL_DISPOSITION_CONNECTED,
  closed: CALL_DISPOSITION_CONNECTED,
  declined: CALL_DISPOSITION_CONNECTED,
  reschedule: CALL_DISPOSITION_CONNECTED,
  left_sample: CALL_DISPOSITION_CONNECTED,
  no_answer: CALL_DISPOSITION_NO_ANSWER,
};

const MEETING_OUTCOME: Record<string, string> = { reschedule: "RESCHEDULED", declined: "NO_SHOW" };
const DEFAULT_MEETING_OUTCOME = "COMPLETED";

const OUTCOME_LABEL: Record<string, string> = {
  reached: "reached the person we came for",
  no_decision_maker: "decision maker not available",
  closed: "closed",
  declined: "declined",
  reschedule: "to be rescheduled",
  no_answer: "no answer",
  left_sample: "sample left",
};

const KIND_LABEL: Record<string, string> = {
  visit: "Visit",
  call: "Call",
  text: "Text",
  email_out: "Email sent",
  email_in: "Email received",
  linkedin: "LinkedIn",
  newsletter: "Newsletter",
  meeting: "Meeting",
  note: "Note",
  order: "Order",
  sample_drop: "Sample drop",
  staff_training: "Staff training",
};

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

type HubspotFieldsConfig = { engagements?: { activity_kind_map?: Record<string, string> } };

async function engagementType(kind: string): Promise<EngagementType> {
  const cfg = await readConfig<HubspotFieldsConfig>("hubspot_fields");
  const mapped = cfg?.engagements?.activity_kind_map?.[kind];
  return (mapped as EngagementType) ?? "NOTE";
}

/** CALL and MEETING are real typed engagements; everything else still falls
 * back to a NOTE object, and the fallback is named rather than silent. */
function effectiveType(etype: EngagementType): EngagementType {
  return etype in ENGAGEMENT_OBJECT ? etype : "NOTE";
}

function hsTimestamp(activity: EngagementActivity): number {
  const raw = activity.at || activity.logged_at;
  if (!raw) return Date.now();
  return new Date(raw).getTime();
}

const marker = (activityId: number): string => `[nb-activity:${activityId}]`;

function typedProperties(
  otype: EngagementType,
  activity: EngagementActivity,
  body: string,
): Record<string, string | number | null> {
  const ts = hsTimestamp(activity);
  const kind = activity.kind || "";
  const outcome = (activity.outcome || "").trim();
  const title = `${KIND_LABEL[kind] ?? kind} — NutriBiotic OS`;

  if (otype === "CALL") {
    return {
      hs_timestamp: ts,
      hs_call_title: title,
      hs_call_body: body,
      hs_call_direction: activity.direction === "inbound" ? "INBOUND" : "OUTBOUND",
      hs_call_status: "COMPLETED",
      hs_call_disposition: CALL_DISPOSITION[outcome] ?? null,
      hubspot_owner_id: OWNER_ID,
    };
  }
  if (otype === "MEETING") {
    // No duration was stated. 30 minutes is the same default touchpoint.ts
    // already uses for calendar proposals, not an invented fact about this visit.
    const end = ts + 30 * 60 * 1000;
    return {
      hs_timestamp: ts,
      hs_meeting_title: title,
      hs_meeting_body: body,
      hs_meeting_start_time: ts,
      hs_meeting_end_time: end,
      hs_meeting_outcome: MEETING_OUTCOME[outcome] ?? DEFAULT_MEETING_OUTCOME,
      hubspot_owner_id: OWNER_ID,
    };
  }
  return { hs_timestamp: ts, hs_note_body: body, hubspot_owner_id: OWNER_ID };
}

type MatchedPerson = { contact: Contact; person: ParsedPerson | null };
type ParsedPerson = {
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** Matching only, never creation. A person in the note not already in
 * nb_contacts is a finding for Juan, not a record to invent. */
function matchPeople(
  contacts: Contact[],
  activity: EngagementActivity,
  parsed: { people?: ParsedPerson[] } | null,
): { matched: MatchedPerson[]; unmatched: ParsedPerson[] } {
  const key = (first?: string | null, last?: string | null) =>
    `${(first ?? "").trim().toLowerCase()} ${(last ?? "").trim().toLowerCase()}`.trim();
  const byName = new Map(contacts.map((c) => [key(c.first_name, c.last_name), c]));
  const byEmail = new Map(
    contacts.filter((c) => c.email).map((c) => [(c.email as string).trim().toLowerCase(), c]),
  );

  const matched: MatchedPerson[] = [];
  const unmatched: ParsedPerson[] = [];

  if (activity.contact_id) {
    const hit = contacts.find((c) => c.id === activity.contact_id);
    if (hit) matched.push({ contact: hit, person: null });
  }

  for (const p of parsed?.people ?? []) {
    const em = (p.email ?? "").trim().toLowerCase();
    let hit = em ? byEmail.get(em) : undefined;
    if (!hit) {
      const k = key(p.first_name, p.last_name);
      if (k) hit = byName.get(k);
    }
    if (!hit) {
      unmatched.push(p);
      continue;
    }
    const already = matched.find((m) => m.contact.id === hit!.id);
    if (already) already.person = already.person ?? p;
    else matched.push({ contact: hit, person: p });
  }
  return { matched, unmatched };
}

function noteLines(
  activity: EngagementActivity,
  matched: MatchedPerson[],
  etype: EngagementType,
  otype: EngagementType,
  hubspotSummary: string | null,
): string[] {
  const kind = activity.kind || "note";
  const when = (activity.at || "").slice(0, 16).replace("T", " ");
  let head = when ? `${KIND_LABEL[kind] ?? kind} · ${when}` : (KIND_LABEL[kind] ?? kind);
  if (otype !== etype) head += ` · would be logged as ${etype}, filed as NOTE (not built yet)`;

  const lines = [head];

  const outcome = (activity.outcome || "").trim();
  if (outcome) lines.push(`Outcome: ${OUTCOME_LABEL[outcome] ?? outcome}`);

  // The shared portal gets the summary, not Juan's full verbatim account: not
  // everything said out loud belongs in a record another rep or HQ reads. The
  // OS keeps the verbatim detail (activity.detail, nb_activities) regardless;
  // this only ever changes what gets typed into HubSpot. Older activities
  // parsed before this field existed fall back to the old verbatim body.
  const body = (hubspotSummary || "").trim() || (activity.detail || "").trim();
  if (body) {
    lines.push("");
    lines.push(body);
  }

  const names = matched
    .map((m) => {
      const n = [m.contact.first_name, m.contact.last_name].filter(Boolean).join(" ").trim();
      if (!n) return null;
      return m.contact.title ? `${n} (${m.contact.title})` : n;
    })
    .filter((n): n is string => Boolean(n));
  if (names.length > 0) {
    lines.push("");
    lines.push(`Spoke with: ${names.join(", ")}`);
  }

  lines.push("");
  lines.push(`Filed by the NutriBiotic OS from a field note by ${activity.actor ?? "juan"}. ${marker(activity.id)}`);
  return lines;
}

/** HubSpot renders hs_note_body as HTML. Escaping is not decoration: an
 * unescaped apostrophe or angle bracket from a store name renders as broken
 * markup, and customer text is data, never markup we trust (AGENTS.md P3). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function noteBody(lines: string[]): string {
  return lines.map(escapeHtml).join("<br>");
}

// ---------------------------------------------------------------------------
// reads that touch HubSpot (search / batch-read; safe without the write flag)
// ---------------------------------------------------------------------------

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "").slice(-10);
}

/** Best-effort: a search failure is treated as no match, the same bias
 * alreadyFiled() uses, never a block. */
async function findContactByPhone(phone: string | null | undefined): Promise<string | null> {
  const d = digits(phone);
  if (!d) return null;
  try {
    const res = await request<{ results?: Array<{ id: string; properties?: Record<string, string | null> }> }>({
      method: "POST",
      path: "/crm/v3/objects/contacts/search",
      body: {
        limit: 5,
        properties: ["phone", "firstname", "lastname"],
        filterGroups: [{ filters: [{ propertyName: "phone", operator: "CONTAINS_TOKEN", value: `*${d}*` }] }],
      },
      entity: "contacts",
      operation: "search",
    });
    for (const r of res.results ?? []) {
      if (digits(r.properties?.phone) === d) return r.id;
    }
  } catch {
    return null;
  }
  return null;
}

/** Best-effort search for an engagement already carrying this activity's
 * marker: catches the POST-succeeded-stamp-failed window. Advisory only. */
async function alreadyFiled(activityId: number, otype: EngagementType): Promise<string | null> {
  const objectType = ENGAGEMENT_OBJECT[otype];
  const bodyProp = otype === "CALL" ? "hs_call_body" : otype === "MEETING" ? "hs_meeting_body" : "hs_note_body";
  try {
    const res = await request<{ results?: Array<{ id: string; properties?: Record<string, string | null> }> }>({
      method: "POST",
      path: `/crm/v3/objects/${objectType}/search`,
      body: {
        limit: 5,
        properties: [bodyProp],
        filterGroups: [
          { filters: [{ propertyName: bodyProp, operator: "CONTAINS_TOKEN", value: `*nb-activity:${activityId}*` }] },
        ],
      },
      entity: objectType,
      operation: "search",
    });
    for (const r of res.results ?? []) {
      if ((r.properties?.[bodyProp] ?? "").includes(marker(activityId))) return r.id;
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// the main flow
// ---------------------------------------------------------------------------

export type EngagementResult = {
  status: "ok";
  activityId: number;
  accountId: string;
  accountName: string;
  otype: EngagementType;
  etype: EngagementType;
  lines: string[];
  matchedNames: string[];
  unmatchedPeople: ParsedPerson[];
  contactErrors: string[];
  alreadyFiledId: string | null;
  wrote: boolean;
  noteId: string | null;
};

/**
 * One activity, all the way to a Note/Call/Meeting (or a dry preview of the
 * same). Mirrors hubspot_notes.py's run(): every read (scope check, phone
 * search, duplicate-marker search) executes regardless of `write`, since none
 * of them mutate anything; only the final POST and its stamp are gated.
 */
export async function runEngagement(activityId: number, opts: { write: boolean }): Promise<EngagementResult> {
  const activity = await getActivityById(activityId);
  if (!activity) throw new Blocked(`nb_activities has no row with id ${activityId}.`);

  if (activity.origin === "synthetic") {
    throw new Blocked(`activity ${activityId} has origin 'synthetic'. Seeded data never crosses into the shared portal.`);
  }
  if (!activity.account_id) {
    throw new Blocked(`activity ${activityId} has no account_id. Resolve the account in the OS first.`);
  }

  const account = await getAccountForEngagement(activity.account_id);
  if (!account) throw new Blocked(`nb_accounts has no row with id ${activity.account_id}.`);
  if (account.origin === "synthetic") {
    throw new Blocked(`account ${account.id} has origin 'synthetic'. Seeded data never crosses into the shared portal.`);
  }
  // FIRST scope assertion: the OS's own mirror of who owns this account.
  // Mirrors hubspot_notes.py's resolve_account(); the SECOND, live-portal
  // assertion runs further down via assertJuansBook().
  if ((account.owner_name ?? "") !== "Juan Arenas Martin") {
    throw new Blocked(
      `account ${account.id} (${account.name}) is owned by '${account.owner_name || "(unowned)"}', ` +
        "not Juan Arenas Martin. Out of scope.",
    );
  }
  if (!account.hubspot_company_id) {
    throw new Blocked(`account ${account.id} (${account.name}) is not linked to a portal company. Linking is a human decision.`);
  }
  const companyId = account.hubspot_company_id;
  const etype = await engagementType(activity.kind || "note");
  const otype = effectiveType(etype);

  // Write-once short-circuit BEFORE the live portal read (matches
  // hubspot_notes.py's run(): the first scope assertion is nb_accounts.
  // owner_name, already checked above via getAccountForEngagement; the
  // second, more expensive one only runs if there is still something to file.
  if (activity.hubspot_engagement_id) {
    return {
      status: "ok",
      activityId,
      accountId: account.id,
      accountName: account.name,
      otype,
      etype,
      lines: [],
      matchedNames: [],
      unmatchedPeople: [],
      contactErrors: [],
      alreadyFiledId: activity.hubspot_engagement_id,
      wrote: false,
      noteId: activity.hubspot_engagement_id,
    };
  }

  // SECOND scope assertion: the live portal record, because the OS mirror can
  // drift (this is the check that was missing on 2026-08-01).
  const scope = await assertJuansBook([companyId]);
  if (!scope.allowed.includes(companyId)) {
    const dropped = scope.dropped.find((d) => d.id === companyId);
    throw new Blocked(
      `portal company ${companyId} (${account.name}) has hubspot_owner_id ${dropped?.owner ?? "(none)"}, ` +
        `not Juan's ${OWNER_ID}. DROPPED, nothing written.`,
    );
  }

  const [contactsRes, parsedRaw] = await Promise.all([
    listContacts(account.id),
    getTouchpointParsedForActivity(activityId),
  ]);
  const parsed = (parsedRaw ?? null) as { people?: ParsedPerson[]; activity?: { hubspot_summary?: string } } | null;
  const { matched, unmatched } = matchPeople(contactsRes.data, activity, parsed);

  // A person named with a phone or email but no live HubSpot contact yet:
  // found by phone anywhere in the portal, or created, associated to this
  // company. The search always runs; only the create POST is gated on write.
  const contactErrors: string[] = [];
  for (const m of matched) {
    if (!m.person || m.contact.hubspot_contact_id) continue;
    const phone = m.person.phone ?? null;
    const email = m.person.email ?? null;
    if (!phone && !email) continue;
    try {
      let cid: string | null = null;
      let created = false;
      if (phone) cid = await findContactByPhone(phone);
      if (!cid) {
        const first = m.contact.first_name ?? m.person.first_name ?? null;
        const last = m.contact.last_name ?? m.person.last_name ?? null;
        if ((first || last) && opts.write) {
          if (email) await ensureCompanyDomainForEmail(companyId, email);
          const res = await request<{ id?: string }>({
            method: "POST",
            path: "/crm/v3/objects/contacts",
            body: {
              properties: {
                ...(first ? { firstname: first } : {}),
                ...(last ? { lastname: last } : {}),
                ...(phone ? { phone } : {}),
                ...(email ? { email } : {}),
                ...(m.person.title || m.contact.title ? { jobtitle: m.person.title ?? m.contact.title } : {}),
              },
              associations: [
                { to: { id: companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: CONTACT_TO_COMPANY }] },
              ],
            },
            entity: "contacts",
            operation: "create",
          });
          if (res.id) {
            cid = res.id;
            created = true;
          }
        }
      }
      if (cid) {
        m.contact.hubspot_contact_id = cid;
        if (created) await linkContactHubspotId(m.contact.id, cid);
      }
    } catch (e) {
      // Enrichment, not a gate: a contact-creation failure must never block
      // the call/meeting/note itself from being filed.
      contactErrors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const contactIds = matched.map((m) => m.contact.hubspot_contact_id).filter((v): v is string => Boolean(v));
  const lines = noteLines(activity, matched, etype, otype, parsed?.activity?.hubspot_summary ?? null);
  const body = noteBody(lines);
  const matchedNames = matched
    .map((m) => [m.contact.first_name, m.contact.last_name].filter(Boolean).join(" ").trim())
    .filter(Boolean);

  if (!opts.write) {
    return {
      status: "ok",
      activityId,
      accountId: account.id,
      accountName: account.name,
      otype,
      etype,
      lines,
      matchedNames,
      unmatchedPeople: unmatched,
      contactErrors,
      alreadyFiledId: null,
      wrote: false,
      noteId: null,
    };
  }

  const dup = await alreadyFiled(activityId, otype);
  let noteId: string;
  if (dup) {
    noteId = dup;
  } else {
    const assoc = [
      { to: { id: companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ENGAGEMENT_TO_COMPANY[otype] }] },
      ...contactIds.map((cid) => ({
        to: { id: cid },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ENGAGEMENT_TO_CONTACT[otype] }],
      })),
    ];
    const props = typedProperties(otype, activity, body);
    const writeProps = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null));
    const res = await request<{ id?: string }>({
      method: "POST",
      path: `/crm/v3/objects/${ENGAGEMENT_OBJECT[otype]}`,
      body: { properties: writeProps, associations: assoc },
      entity: ENGAGEMENT_OBJECT[otype],
      operation: "create",
    });
    if (!res.id) throw new Blocked(`HubSpot accepted the ${otype.toLowerCase()} but returned no id; refusing to stamp.`);
    noteId = res.id;
  }

  await stampActivityEngagementId(activityId, noteId);

  return {
    status: "ok",
    activityId,
    accountId: account.id,
    accountName: account.name,
    otype,
    etype,
    lines,
    matchedNames,
    unmatchedPeople: unmatched,
    contactErrors,
    alreadyFiledId: null,
    wrote: !dup,
    noteId,
  };
}
