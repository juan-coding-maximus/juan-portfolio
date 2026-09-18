/**
 * Record a touchpoint. Juan types what just happened; this turns it into a
 * clean activity log entry, fills contact detail, files the activity into
 * HubSpot as a Note/Call/Meeting (autoFileEngagement, below), and drafts
 * calendar follow-ups for him to approve.
 *
 * NO FABRICATION (agency AGENTS.md principle 2): the extraction prompt is
 * instructed to pull only what the text actually states, never invent a name,
 * email, phone, or date. Contact detail is filled, never overwritten, so a
 * bad parse can only add a blank field, never clobber a true one.
 *
 * A STATED RETURN VISIT IS A ROUTE INSTRUCTION, NOT A CALENDAR EVENT
 * (Juan's standing order, 2026-09-03). "Come back tomorrow at 12:30" used to
 * become an nb_calendar_proposals row, and calendar_sync.py picked those up
 * at status 'pending' and created a real event on his own Google Calendar
 * with no click in between. That is not how a return visit gets scheduled:
 * it gets scheduled by landing on an upcoming route with the stated time
 * honoured, which is nutribiotic-route-planner's job. So every
 * calendar_action now queues an nb_directives row targeted at
 * nutribiotic-route-planner, verbatim, status 'pending', alongside the
 * agency directives Juan spoke. Queued, never executed on arrival (root
 * AGENTS.md P1, migration 0058). Nothing in this file writes
 * nb_calendar_proposals any more; the table survives read-only so the rows
 * already in it stay visible and closable.
 */

"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import {
  applyAccountFacts,
  finalizeTouchpointAccount,
  finalizeTouchpointNextStep,
  getAccount,
  getPriorityBook,
  getTouchpointById,
  insertActivity,
  insertCloseSignal,
  insertContact,
  insertAskDraft,
  insertDirectives,
  insertFieldNote,
  insertTouchpoint,
  listAccountsForMatching,
  listAskKeys,
  listContacts,
  markRouteStopDoneForAccountToday,
  patchContact,
  type AccountFactsReport,
  type Contact,
} from "./dal";
import { asksCollide, composeAsk } from "./ask-compose";
import { Blocked, runEngagement } from "./hubspot-engagement";
import { ensurePortalCompanyForActivity } from "./hubspot-graduate";
import { formatBusinessHours, pushBusinessHours, pushCompanyEmail, pushCompanyPhone } from "./hubspot-company";

/**
 * File the just-logged activity straight into HubSpot, no click. One
 * touchpoint should mean one thing happened: the account, the activity, and
 * the note, all at once, the same "hands-off" contract the clientos skill
 * already gives Juan from the CLI (see .claude/skills/clientos/SKILL.md) and
 * AGENTS.md's "Automate housekeeping" standing order. A filing failure never
 * unwinds the touchpoint itself, the activity just stays unfiled and drops
 * into the Visit tab's manual queue below for a retry.
 *
 * AN ACCOUNT WITH NO PORTAL COMPANY IS NOW GRADUATED HERE, not refused (Juan,
 * 2026-09-09). runEngagement still throws Blocked on a null hubspot_company_id,
 * which is right for every other caller; this door runs
 * ensurePortalCompanyForActivity first, so an SDR-originated prospect he just
 * called gets its company, its address, its hours and its people pushed, and
 * then files the note down the one normal path. A possible duplicate in the
 * shared portal still stops the whole thing and comes back as
 * hubspotError for Juan to resolve by hand: see hubspot-graduate.ts.
 */
export async function autoFileEngagement(activityId: number): Promise<HubspotFilingReport> {
  try {
    const grad = await ensurePortalCompanyForActivity(activityId);
    if (grad.status === "blocked") {
      return {
        hubspotFiled: false,
        hubspotNoteId: null,
        hubspotError: grad.reason,
        hubspotLeaks: 0,
        companyPhoneFilled: null,
        companyPhoneConflict: null,
        companyCreatedId: null,
        contactsFiled: [],
      };
    }
    const filed = await runEngagement(activityId, { write: true });
    return {
      hubspotFiled: filed.wrote || Boolean(filed.alreadyFiledId),
      hubspotNoteId: filed.noteId ?? filed.alreadyFiledId,
      hubspotError: grad.status === "created" && grad.contactErrors.length
        ? `Company created, but ${grad.contactErrors.length} contact(s) did not file: ${grad.contactErrors.join("; ")}`
        : null,
      companyCreatedId: grad.status === "created" ? grad.companyId : null,
      contactsFiled: grad.status === "created" ? grad.contactsFiled : [],
      // Carried to the screen rather than only to the sync log. A link HubSpot
      // made on its own and this run undid is exactly the kind of thing that
      // previously surfaced days later in a field report.
      hubspotLeaks: filed.leaks.length,
      companyPhoneFilled: filed.companyPhone && "filled" in filed.companyPhone ? filed.companyPhone.filled : null,
      companyPhoneConflict:
        filed.companyPhone && "conflict" in filed.companyPhone ? filed.companyPhone.conflict.existing : null,
    };
  } catch (e) {
    return {
      hubspotFiled: false,
      hubspotNoteId: null,
      hubspotError: e instanceof Blocked ? e.message : e instanceof Error ? e.message : String(e),
      hubspotLeaks: 0,
      companyPhoneFilled: null,
      companyPhoneConflict: null,
      companyCreatedId: null,
      contactsFiled: [],
    };
  }
}

export type HubspotFilingReport = {
  hubspotFiled: boolean;
  hubspotNoteId: string | null;
  hubspotError: string | null;
  /** Count of unrequested company links detached during this filing. */
  hubspotLeaks: number;
  /** The number written onto the company record, when it had none. */
  companyPhoneFilled: string | null;
  /** The number already on the company, when it disagreed and was kept. */
  companyPhoneConflict: string | null;
  /** Set when THIS filing is what earned the account its portal company
   *  (HARD RULE 20's graduation). Null on every ordinary filing. */
  companyCreatedId: string | null;
  /** Named people pushed onto that brand-new company, in full. Empty on an
   *  ordinary filing; the engagement's own contact matching is unchanged. */
  contactsFiled: string[];
};

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * Kinds that mean the stop was serviced (Juan, 2026-08-31: a filed engagement
 * of any of these means the stop is done, an occasional false positive, e.g.
 * a remote "meeting", is fine, an unmarked stop he actually serviced is the
 * worse failure). Async written channels (text/email/linkedin/newsletter) and
 * kinds that don't belong to a single stop (order, note) stay excluded.
 */
const IN_PERSON_ENGAGEMENT_KINDS = new Set(["visit", "meeting", "call", "sample_drop", "staff_training"]);

/**
 * The second auto-done trigger (Juan's ask 2026-08-31): a filed HubSpot
 * engagement for an account on today's route is stronger evidence he serviced
 * that stop than any location fix, and it fires the instant the note is
 * filed rather than waiting on a location report to happen to land nearby.
 * Never blocks or reports failure to the caller -- this is a side-effect of a
 * successful filing, not a condition of one (same "never fails the visit
 * itself" treatment as accountFacts below).
 */
async function maybeMarkStopServiced(accountId: string, kind: string, hubspotFiled: boolean): Promise<void> {
  if (!hubspotFiled || !IN_PERSON_ENGAGEMENT_KINDS.has(kind)) return;
  try {
    await markRouteStopDoneForAccountToday(accountId);
  } catch {
    // A route side-effect never fails a HubSpot filing that already succeeded.
  }
}

type ParsedPerson = {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  role_tag: "buyer" | "owner" | "manager" | "clerk" | "other" | null;
  is_decision_maker: boolean;
  email: string | null;
  phone: string | null;
  preferences: string | null;
};

/**
 * File one parsed person against an account: update the existing contact if
 * there is one, insert a new row otherwise. Matches by email first, then by
 * name (mirrors hubspot-engagement.ts's matchPeople), because a front-desk
 * contact is often re-mentioned by role ("they said they'd forward it") on a
 * later visit with no name attached, and matching by name only misses that
 * it is the same person nb_contacts already has, tried to insert them again,
 * and hit nb_contacts_account_email_uniq (confirmed 2026-09-16, Modern
 * Esthetics: frontdesk@modernesthetics.com already on file, name-only match
 * missed it, the raw Postgres 409 reached Juan's screen and the whole
 * touchpoint filing died with it).
 *
 * The insert is still wrapped: even with email matching, a race (two
 * touchpoints for the same new contact landing together) can still hit the
 * same unique constraint, and per Juan (2026-09-16) that must never fail the
 * filing. A 23505 on this table can only mean "this account already has this
 * email", i.e. the append already happened; treated as a no-op, not an error.
 */
async function reconcileContact(
  accountId: string,
  existing: Contact[],
  p: ParsedPerson,
): Promise<"added" | "updated" | "none"> {
  const nameKey = (s: string | null) => (s ?? "").trim().toLowerCase();
  const emailKey = (s: string | null) => (s ?? "").trim().toLowerCase();
  const pEmail = emailKey(p.email);

  const match =
    (pEmail && existing.find((c) => emailKey(c.email) === pEmail)) ||
    existing.find(
      (c) =>
        nameKey(c.first_name) === nameKey(p.first_name) &&
        nameKey(c.last_name) === nameKey(p.last_name) &&
        (nameKey(p.first_name) || nameKey(p.last_name)) !== "",
    );

  if (match) {
    // Fill blanks only. A field the CRM already has is never overwritten by a parse.
    const patch: Record<string, string | boolean> = {};
    if (!match.title && p.title) patch.title = p.title;
    if (!match.role_tag && p.role_tag) patch.role_tag = p.role_tag;
    if (!match.email && p.email) patch.email = p.email;
    if (!match.phone && p.phone) patch.phone = p.phone;
    if (!match.is_decision_maker && p.is_decision_maker) patch.is_decision_maker = true;
    if (Object.keys(patch).length === 0) return "none";
    await patchContact(match.id, patch);
    return "updated";
  }

  if (!p.first_name && !p.last_name && !p.title) return "none";
  try {
    await insertContact({
      account_id: accountId,
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      role_tag: p.role_tag,
      is_decision_maker: p.is_decision_maker,
      email: p.email,
      phone: p.phone,
    });
    return "added";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("nb_contacts_account_email_uniq") || msg.includes('"code":"23505"')) return "none";
    throw e;
  }
}

type ParsedCalendarAction = {
  kind: "meeting" | "reminder" | "visit";
  title: string;
  when_iso: string | null;
  duration_minutes: number | null;
  notes: string | null;
};

type ParsedOutreachAsk = { ask: string };

export type ParsedTouchpoint = {
  account_id: string | null;
  account_confidence: "high" | "low" | "none";
  business_name_guess: string | null;
  activity: {
    kind: string;
    direction: "outbound" | "inbound" | "internal";
    outcome: string | null;
    detail: string;
    hubspot_summary: string;
  };
  people: ParsedPerson[];
  calendar_actions: ParsedCalendarAction[];
  account_facts: ParsedAccountFacts;
  /**
   * The concrete next action for this account, plainly stated, or an honest
   * null when the note never addresses what happens next (the common case).
   * Never invented: see EXTRACT_TOOL's own description and needsNextStep
   * below, which is what asks Juan directly rather than guessing one.
   */
  next_step: string | null;
  directives?: ParsedDirective[];
  outreach_asks?: ParsedOutreachAsk[];
};

/**
 * An instruction Juan aimed at the agency, said in the same breath as a note.
 * HARD RULE 15 already routed "go find their email from the website" to the
 * enricher instead of into hubspot_summary; this is that rule generalized to
 * every agent, and it is queued in nb_directives rather than executed. Root
 * AGENTS.md P1 does not lapse because Juan is the one who spoke the
 * instruction: it is still surfaced and drained deliberately, never on arrival.
 */
type ParsedDirective = {
  directive: string;
  target: string | null;
  scope: "nutribiotic" | "agency";
};

type DirectiveRow = {
  field_note_id: string | null;
  directive: string;
  target: string | null;
  scope: string;
  account_id: string | null;
};

/**
 * One stated follow-up ("come back tomorrow at 12:30", "drop the sample off
 * Thursday") turned into a route-planner directive.
 *
 * WHY THIS IS NOT A CALENDAR PROPOSAL ANY MORE. See the file header. A return
 * visit is scheduled by landing on an upcoming route with the stated time
 * honoured, never by an event this code puts on Juan's real calendar. The
 * directive is what nutribiotic-route-planner drains; nb_directives is the
 * queue that already exists for exactly this (migration 0058), and the
 * extraction prompt already names nutribiotic-route-planner as the target for
 * "go back, go see, plan a day".
 *
 * NOTHING IS INVENTED HERE. The title, the notes, the duration and the
 * resolved timestamp are copied through as the extractor produced them, and a
 * follow-up with no stated time says so in words rather than acquiring a
 * default. The old proposal path defaulted duration_minutes to 60; that
 * default is gone, because a duration nobody stated is a fact nobody stated.
 */
function returnVisitDirectiveRows(
  actions: ParsedCalendarAction[] | undefined,
  fieldNoteId: string | null,
  accountId: string | null,
  accountName: string | null,
): DirectiveRow[] {
  return (actions ?? []).map((ca) => {
    const parts: string[] = [accountName ? `${accountName}: ${ca.title}` : ca.title];
    parts.push(ca.when_iso ? `Stated time: ${ca.when_iso}` : "No time stated");
    if (ca.duration_minutes) parts.push(`Stated duration: ${ca.duration_minutes} min`);
    if (ca.notes) parts.push(ca.notes);
    return {
      field_note_id: fieldNoteId,
      directive: `[follow-up:${ca.kind}] ${parts.join(" · ")}`,
      target: "nutribiotic-route-planner",
      scope: "nutribiotic",
      account_id: accountId,
    };
  });
}

/** Agency instructions spoken inside a note, verbatim. HARD RULE 15. */
function agencyDirectiveRows(
  directives: ParsedDirective[] | undefined,
  fieldNoteId: string | null,
  accountId: string | null,
): DirectiveRow[] {
  return (directives ?? []).map((d) => ({
    field_note_id: fieldNoteId,
    directive: d.directive,
    target: d.target ?? null,
    scope: d.scope === "agency" ? "agency" : "nutribiotic",
    account_id: accountId,
  }));
}

/**
 * "Tell outbound a client needs an email with specifics" used to be a
 * separate manual flag Juan typed by hand on the SDR page. Juan's ask,
 * 2026-09-08: it should come straight from the call/visit he already logged,
 * not a second thing to fill in. So a stated ask ("send me pricing", "email
 * the catalog", "wants samples info") lands in the same nb_outbound_drafts
 * queue the Outbound tab reads, exactly like the manual flag did, except it
 * only fires when the text actually says the customer asked for or was
 * promised something, never invented to fill a gap. field_note notes never
 * reach this (no customer was contacted), so this is only called from the
 * two real-contact branches below.
 *
 * IT IS WRITTEN HERE, NOT LEFT AS A FRAGMENT (2026-09-17). Until now this
 * queued the ask exactly as the extractor phrased it, and the Outbound card
 * rendered that half-sentence as though it were a draft: no subject, no
 * recipient, nothing a person could send. Juan: "these drafts are bullshit."
 * Each ask now goes through lib/ask-compose.ts on the way in, with the note it
 * came from as its only other source, and an ask that cannot honestly be
 * turned into an email is filed saying so instead of pretending.
 *
 * ONE ASK, ONE ROW, FOREVER. The collision check runs against every ask
 * already filed for this account whatever became of it, so the same
 * conversation logged twice (which is exactly what happened at Lazy Acres on
 * 2026-09-15, the same note submitted seventeen seconds apart) files once, and
 * a row Juan dismissed is never proposed again.
 */
async function fileOutreachAsks(
  asks: ParsedOutreachAsk[] | undefined,
  accountId: string | null,
  noteText: string,
): Promise<number> {
  if (!accountId || !asks?.length) return 0;

  const [accountRes, contactsRes, alreadyFiled] = await Promise.all([
    getAccount(accountId),
    listContacts(accountId),
    listAskKeys(accountId),
  ]);
  const account = accountRes.data[0];
  if (!account) return 0;

  const seen = alreadyFiled.map((r) => r.source_ask);
  const contacts = contactsRes.data
    .map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
      title: c.title,
      email: c.email,
    }))
    .filter((c) => c.name);

  let filed = 0;
  for (const a of asks) {
    const ask = a.ask?.trim();
    if (!ask) continue;
    if (seen.some((prior) => asksCollide(prior, ask))) continue;

    const composed = await composeAsk({
      ask,
      noteText,
      account: { id: account.id, name: account.name, city: account.city, email: account.email },
      contacts,
    });
    await insertAskDraft({ account_id: accountId, ask, composed });
    seen.push(ask);
    filed += 1;
  }
  return filed;
}

/**
 * Facts about the BUSINESS itself, stated during the visit, distinct from a
 * person's own phone/email in `people[]`. Blank-fills nb_accounts (HARD RULE
 * 14): a structured fact belongs in its own HubSpot property AND the note
 * text, not one or the other, and hours specifically never carry two live
 * conflicting answers (resolve to the more conservative reading).
 */
type ParsedAccountFacts = {
  business_hours: Record<string, string[][]> | null;
  phone: string | null;
  email: string | null;
};

const EXTRACT_TOOL = {
  name: "extract_touchpoint",
  description: "Extract structured field-sales data from a rep's raw note about one account visit/call/interaction.",
  input_schema: {
    type: "object" as const,
    properties: {
      account_id: {
        type: ["string", "null"],
        description: "id of the best-matching account from the candidate list, or null if no confident match",
      },
      account_confidence: { type: "string", enum: ["high", "low", "none"] },
      business_name_guess: {
        type: ["string", "null"],
        description: "the business/store name AS STATED in the note, verbatim, even when account_confidence is low or none. Null only if no business name was said at all.",
      },
      activity: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "visit", "call", "text", "email_out", "email_in", "linkedin",
              "newsletter", "meeting", "note", "order", "sample_drop", "staff_training",
              "field_note",
            ],
            description: "An in-person stop at a store or office, walked in or dropped by, is 'visit', even when the rep talks to or 'meets with' someone while there. Use 'meeting' only when the text itself frames it as a scheduled, formal meeting or appointment, not just a conversation that happened in person. This is what titles the HubSpot record ('Visit' vs 'Meeting'), and almost everything a rep dictates from the field is a visit. 'field_note' is the one kind that is NOT a customer contact: no store was called, walked into, emailed or texted. It covers an observation about a market or a storefront the rep only looked at, a note to self about how the work should go, and an instruction aimed at his own agency. A field note never reaches HubSpot, so choosing it wrongly hides real customer contact, and choosing anything else for a note to self invents a customer contact that never happened.",
          },
          direction: { type: "string", enum: ["outbound", "inbound", "internal"] },
          outcome: {
            type: ["string", "null"],
            enum: ["reached", "no_decision_maker", "closed", "declined", "reschedule", "no_answer", "left_sample", null],
            /* 'closed' CARRIES WEIGHT NOW (2026-09-09) and needs saying out
               loud: it queues a proposal to mark the company Closed in the
               shared HubSpot portal (nb_close_signals, migration 0073). It
               means THE BUSINESS IS GONE, not that a deal was closed or that
               the shop was shut at the hour the rep walked past. A rep who
               won an order said 'reached', and a rep who found the lights off
               on a Sunday said nothing about the business existing. */
            description: "Use 'closed' only when the text says the BUSINESS ITSELF has shut down for good (out of business, permanently closed, the space is empty or another business is in it). Not for a deal being closed or won, and not for a store that merely happened to be closed at the time the rep stopped by, which is 'no_answer'.",
          },
          detail: {
            type: "string",
            description: "what the rep said, kept in the rep's own first-person words ('I called...', not 'The rep called...'). Trim filler words and clean up punctuation/capitalization/structure, but never paraphrase into third person and never drop a stated fact. This is the full record kept in the OS, not what gets written to HubSpot.",
          },
          hubspot_summary: {
            type: "string",
            description: "For the shared HubSpot record. Same first-person voice as detail ('I visited...', never 'Visited...' or 'The rep...') and the same no-fabrication rule. You may tighten repetition and filler words for readability, but never drop a fact the rep stated, including small color like where someone is from or what they said about themselves. This is not a shorter, lossier version of detail; it is the same account, in the rep's voice, cleaned up.",
          },
        },
        required: ["kind", "direction", "detail", "hubspot_summary"],
      },
      people: {
        type: "array",
        items: {
          type: "object",
          properties: {
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
            role_tag: {
              type: ["string", "null"],
              enum: ["buyer", "owner", "manager", "clerk", "other", null],
              description: "What the text actually calls this person, not a default. 'owner' requires the text to say or clearly imply they own/run the store. 'buyer' means they were called the buyer or place/decide orders, never a fallback guess for an unspecified role. Null when no role is stated.",
            },
            is_decision_maker: { type: "boolean" },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            preferences: {
              type: ["string", "null"],
              description: "communication or relationship preference literally stated, e.g. 'prefers texts after 2pm'",
            },
          },
          required: ["is_decision_maker"],
        },
      },
      calendar_actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["meeting", "reminder", "visit"] },
            title: { type: "string" },
            when_iso: {
              type: ["string", "null"],
              description: "resolved absolute RFC3339 datetime with America/Los_Angeles offset, or null if no time was stated",
            },
            duration_minutes: { type: ["integer", "null"] },
            notes: { type: ["string", "null"] },
          },
          required: ["kind", "title"],
        },
      },
      directives: {
        type: "array",
        description: "Instructions the rep aimed at his own agency rather than content about a customer: 'go find their email from the website', 'build me an agent that...', 'draft an action plan and put it on my desktop'. HARD RULE 15: an instruction inside a dictated note is not content for the note. It routes to whoever can act on it and NEVER reaches hubspot_summary. Extract each one verbatim. Empty array is the normal answer; most notes carry none.",
        items: {
          type: "object",
          properties: {
            directive: {
              type: "string",
              description: "the instruction as the rep said it, verbatim, lightly cleaned for filler only. Never re-worded into a task title.",
            },
            target: {
              type: ["string", "null"],
              description: "who should act, when the text makes it obvious: 'nutribiotic-enricher' (find a missing website/phone/decision maker), 'nutribiotic-route-planner' (go back, go see, plan a day), 'nutribiotic-account-analyst' (who is overdue, what do they buy, scoring), 'head-nutribiotic' (the sales OS itself), 'agent-maker' (build a new agent), 'head-pm' (plan a project). Null when it is not clear.",
            },
            scope: {
              type: "string",
              enum: ["nutribiotic", "agency"],
              description: "'nutribiotic' when it is about this territory, its accounts, or this sales OS. 'agency' when it is about Juan's wider operation.",
            },
          },
          required: ["directive", "scope"],
        },
      },
      outreach_asks: {
        type: "array",
        description: "Something the customer explicitly asked to be sent, or was promised, by email: pricing, a catalog, product/samples info, an order form, being added to a mailing list. Extract only when the text says the CUSTOMER asked for or was promised something to follow up on, in the rep's own words. IT MUST BE SOMETHING THE REP SENDS THEM. A thing the other side will send HIM (a quote a printer promised him, an email the owner is expected to write, an order they will place) is not an outreach ask however real it is: it is already in the note, and there is nothing here for him to write. Empty array is the normal answer; most notes carry none. This is content ABOUT the customer, not an instruction to the agency, so never duplicate it into directives, and never invent a need that wasn't actually stated.",
        items: {
          type: "object",
          properties: {
            ask: {
              type: "string",
              description: "what the customer asked for or was promised, in the rep's own words, lightly cleaned for filler only. Never re-worded into an email subject or a task title.",
            },
          },
          required: ["ask"],
        },
      },
      account_facts: {
        type: "object",
        description: "Facts about the BUSINESS itself, only when explicitly stated about the store/office as a whole, never inferred from a person's own contact info in people[]. Null fields are the common case, most visits state none of this.",
        properties: {
          business_hours: {
            type: ["object", "null"],
            description: "The business's stated hours, as a 7-key object (mon/tue/wed/thu/fri/sat/sun), each value an array of [\"HH:MM\",\"HH:MM\"] 24-hour windows (empty array for a closed day, e.g. a lunch break means two windows in one day). Only include a day the text actually covers; if the note states weekday hours but says nothing about the weekend, still return all 7 keys, empty array for the days not mentioned, rather than guessing they're closed. Null entirely if no hours were stated at all.",
          },
          phone: {
            type: ["string", "null"],
            description: "The business's own general/store phone number, only if stated as the store's number, not a specific person's direct line (that belongs in people[].phone).",
          },
          email: {
            type: ["string", "null"],
            description: "The business's own general/ordering email, only if stated as the store's address (e.g. 'their email is orders@...'), not a specific person's email (that belongs in people[].email).",
          },
        },
        required: ["business_hours", "phone", "email"],
      },
      next_step: {
        type: ["string", "null"],
        description: "The concrete next action for this account, in plain words, written so a different rep could act on it without rereading the note (e.g. \"Call back Thursday about the reorder\", \"Drop off a GSE sample on the next visit\", \"No follow-up, he is not interested\", \"Nothing further, he is all stocked up\"). Fill this whenever the text states or clearly implies what happens next, INCLUDING an explicit statement that nothing further is needed. IT MUST NAME WHAT HAPPENS. A bare \"follow up\", \"check in\", \"touch base\", \"keep in touch\", \"revisit\", or \"stay on it\" with no object is not a next action and must be left null, even though the rep said the words, because it tells the next reader nothing he could act on. Leave it null ONLY when the text says nothing at all about what comes next for this account, or says only something that vague, which is common and expected: never invent one to fill this field, and never sharpen a vague phrase into a specific-sounding action the rep did not state.",
      },
    },
    required: ["account_confidence", "business_name_guess", "activity", "people", "calendar_actions", "account_facts", "next_step", "directives", "outreach_asks"],
  },
};

function systemPrompt(nowIso: string, candidates: { id: string; name: string; city: string | null }[]): string {
  return `You extract structured field-sales data from one raw note a rep just typed about a store visit, call, or other touchpoint.

Reference time (America/Los_Angeles): ${nowIso}. Resolve every relative date/time ("Thursday", "next week", "in a month") against this reference.

Candidate accounts (id · name · city), pick the single best match or null:
${candidates.map((c) => `${c.id} · ${c.name} · ${c.city ?? "unknown city"}`).join("\n")}

RULES, all absolute:
- Extract only what the text states or directly implies. Never invent a name, title, email, phone, date, or outcome that is not in the text.
- If the account is not clearly identifiable from the candidate list, set account_id to null and account_confidence to "none" rather than guessing.
- business_name_guess is the store/business name as the rep actually said it, verbatim, ALWAYS extracted when one was said, regardless of account_confidence. It is used to search for the business when it turns out to be new, so it must never be normalized, expanded, or guessed at when none was actually stated.
- activity.detail is what the rep said, kept in the rep's own first-person words ("I called...", not "The rep called..."). You may tidy filler, punctuation, and capitalization, and add light structure, but never rewrite it into third person, never paraphrase away his actual wording, and never drop a fact he stated.
- activity.hubspot_summary is what reaches the shared CRM another rep or HQ reads. It must match activity.detail's first-person voice and completeness: never third person, never "the rep," never "visited" with no subject, and never drop a fact, however small (an aside about where someone is from, what they said about themselves, etc). You may tighten redundant phrasing, but do not summarize facts away. Still never invent a name, number, date, or fact not in the text.
- Only include a person in "people" if the note actually names them or clearly describes a specific individual (a title alone like "the manager" with no name is still worth including with first_name/last_name null, if a real detail like an email or a stated preference is attached to them).
- role_tag is this person's relationship to the business, read from what the text actually calls them: "owner" only when the text states or clearly implies they own or run the store ("the store owner," "she's owned it 40 years," "his shop"); "manager" when called a manager or store lead; "clerk" for front-desk or counter staff with no stated authority; "buyer" ONLY when the text calls them the buyer or the one who places/decides orders and nothing stronger (owner/manager) is stated; "other" for a role that doesn't fit those, e.g. a vet or a bookkeeper; null when no role is stated at all. Never default to "buyer" as a guess, it is its own specific claim, not a fallback for "someone at this business." is_decision_maker is separate: whether they can approve buying, not which of these roles they hold.
- Only include a calendar_action if the note describes something that should go on a calendar (a scheduled meeting, an explicit follow-up date, a planned return visit). Do not invent a follow-up that was not mentioned.
- when_iso must be a real resolved timestamp if a specific day/time was stated; if only vague ("follow up soon") leave it null and say so in notes.
- FIRST, decide whether a customer was actually contacted. If nobody at a business was spoken to, walked in on, called, emailed or texted, activity.kind is "field_note" and direction is "internal". An observation about a storefront he only looked at or walked through, a thought about the market or the product line, a note to self about how the work should go, and an instruction to his own agency are ALL field notes. Do not reach for "visit", "call" or "meeting" because the note mentions a business name; a business named in passing is not a business contacted. A field note is never written to HubSpot, so hubspot_summary for one is short and plain, and it must never claim a contact happened ("I visited...", "I called...") when none did.
- Never set account_confidence to "high" on a field note unless the note is genuinely ABOUT that specific account (an observation about that store). A note to self that merely happens to mention a place is account_confidence "none" with account_id null. Attaching a note to self to a business is how a company gets created to receive it, which has already happened once and is what this kind exists to stop.
- directives carry instructions aimed at the agency, verbatim, and those same words must NOT appear in hubspot_summary. A note can be a real customer visit AND carry a directive; extract both. A note that is nothing but an instruction is a field_note whose detail is the instruction's own content.
- account_facts is for a fact about the BUSINESS as a whole, not a person: hours, a general store phone, a general ordering email. Only fill a field when the text states it about the store/office itself ("their hours are...", "the store's number is..."); a person's own phone or email belongs in people[], never here. Most visits state none of this, null is the normal answer.
- outreach_asks is for something the CUSTOMER asked for or was promised (pricing, a catalog, samples info, an order form), not something the rep decided to go do on his own, and not something the other side is going to send HIM. Only extract it when the text actually says the customer asked or was told something would be sent, by the rep. Do not put the same content in both outreach_asks and directives; directives are the rep's own instructions to his agency, outreach_asks are about the customer.
- next_step is a short, concrete statement of what happens with this account next, written so a different rep could act on it without rereading the note. Fill it whenever the text states or clearly implies a next action, INCLUDING an explicit "no follow-up" ("he said no", "nothing further, not interested", "all set for now"). The bar is that it NAMES the action: "bring a GSE sample Thursday", "call Maria back about case pricing", "email the catalog to the buyer". A vague "follow up", "check in", "touch base" or "circle back" with no stated object is NOT a next action, and is left null so the rep gets asked directly rather than shipped a line nobody can act on. Leave it null when the text is silent, or only that vague; the rep is asked one short question and answers in his own words, which is always better than a guess. Never invent a next step, and never turn a vague phrase into a specific-sounding one.`;
}

export type RecordTouchpointResult =
  | {
      ok: true;
      touchpoint_id: string;
      accountName: string | null;
      /** The account this landed on. Carried back so the capture surface can
       * apply a grade Juan picked while typing, without a second lookup. */
      accountId: string | null;
      /** The nb_activities row this call/visit was actually filed as, null
       *  for a field note (isFieldNote true), which never gets one, see
       *  HARD RULE 17. See nb_sdr_schedule (0061): a scheduled item links to
       *  this rather than duplicating what happened in its own text. */
      activityId: number | null;
      needsAccount: false;
      needsNextStep: false;
      /** True when nothing about this was a customer contact: it lives in
       *  nb_field_notes, counts as a touchpoint, and never reaches HubSpot. */
      isFieldNote?: boolean;
      /** Every nb_directives row queued by this note: agency instructions
       *  plus stated return visits. Queued, never executed on arrival. */
      directiveCount?: number;
      /** The return-visit subset, aimed at nutribiotic-route-planner. These
       *  replace what used to be nb_calendar_proposals rows: a stated return
       *  lands on an upcoming route, never on Juan's Google Calendar. */
      routeDirectives?: number;
      summary: string;
      peopleAdded: number;
      peopleUpdated: number;
      hubspotFiled: boolean;
      hubspotNoteId: string | null;
      hubspotError: string | null;
      hubspotLeaks: number;
      companyPhoneFilled: string | null;
      companyPhoneConflict: string | null;
      accountFacts: AccountFactsReport | null;
    }
  | {
      ok: true;
      touchpoint_id: string;
      accountName: null;
      needsAccount: true;
      needsNextStep: false;
      summary: string;
      businessNameGuess: string | null;
      // The model's own low-confidence guess at an EXISTING account, surfaced
      // as the "Client Match:" pill (see AccountMatchResolver) rather than
      // discarded. Only ever set when account_confidence is "low": "none"
      // means the model found no plausible candidate at all, and a "high"
      // match auto-files below rather than landing here.
      matchAccountId: string | null;
      matchAccountName: string | null;
      peopleAdded: 0;
      peopleUpdated: 0;
      /** Nothing is queued until the note has an account: a return visit with
       *  no store to return to is not yet a route instruction. It rides in
       *  `parsed` and is queued by resolveTouchpointToAccount. */
      routeDirectives: 0;
    }
  | {
      ok: true;
      /** Account resolved, but the note never says what happens next.
       *  Parked (nb_touchpoints.status = 'needs_next_step'); nothing is
       *  filed to HubSpot until Juan answers the popup (see
       *  resolveTouchpointNextStep) or explicitly says none is needed. */
      touchpoint_id: string;
      needsAccount: false;
      needsNextStep: true;
      accountId: string;
      accountName: string | null;
      summary: string;
    }
  | { ok: false; error: string };

export async function recordTouchpoint(
  rawText: string,
  accountIdHint?: string | null,
  occurredAt?: string | null,
  opts: {
    autoFileHubspot?: boolean;
    kindOverride?: "meeting" | "call" | "email" | "field_note";
    /**
     * Juan already knows this is not one of his 273. Skip account matching
     * entirely and park straight into the create-a-business flow.
     *
     * This is an accuracy control, not a shortcut. The matcher's failure mode
     * is confidently attaching a brand-new store to a similarly-named existing
     * account (a chain's other branch, a same-name store one city over), and
     * that fuses two stores' histories, which HARD RULE 3 exists to prevent
     * and which nobody notices from the field. When the rep standing in the
     * door says it's new, his word outranks a name-similarity guess, the same
     * precedence accountIdHint and kindOverride already have.
     */
    forceNewAccount?: boolean;
  } = {},
): Promise<RecordTouchpointResult> {
  const autoFileHubspot = opts.autoFileHubspot ?? true;
  const text = rawText.trim();
  if (!text) return { ok: false, error: "Nothing to record." };
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured on this deployment." };

  // Juan's book only, which listAccountsForMatching() enforces (owner-scoped, not
  // closed, not a waypoint), but WITHOUT the Territory page's chain/practice_excluded
  // filters: a rep logging a real call must never be told an existing client is new
  // just because that account is hidden from one work-queue screen. See the function
  // doc for the incident that caught this.
  const accountsRes = await listAccountsForMatching();
  const candidates = accountsRes.data.map((a) => ({ id: a.account_id, name: a.name, city: null as string | null }));
  if (candidates.length === 0) {
    return { ok: false, error: "No accounts to match against yet." };
  }

  const now = new Date();

  let parsed: ParsedTouchpoint;
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: systemPrompt(now.toISOString(), candidates),
      messages: [{ role: "user", content: text }],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_touchpoint" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { ok: false, error: "Could not parse that note. Try rephrasing." };
    }
    parsed = toolUse.input as ParsedTouchpoint;
  } catch (err) {
    return { ok: false, error: `Parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  return continueTouchpoint(text, parsed, accountsRes, accountIdHint, occurredAt, autoFileHubspot, opts, now);
}

/**
 * Everything recordTouchpoint does once a `parsed` result exists, whether
 * that came from its own extraction call above or from previewTouchpoint's
 * (below): the kind override, the field-note/needs-account/needs-next-step
 * branches, and the straight-through file. Split out 2026-09-15 so the new
 * review-before-commit flow can run the SAME extraction once, hold the
 * result on screen for Juan to read and edit, and then run this exact tail
 * rather than re-parsing the text a second time (which would cost a second
 * model call and risk the preview and the commit quietly disagreeing).
 */
async function continueTouchpoint(
  text: string,
  parsed: ParsedTouchpoint,
  accountsRes: Awaited<ReturnType<typeof listAccountsForMatching>>,
  accountIdHint: string | null | undefined,
  occurredAt: string | null | undefined,
  autoFileHubspot: boolean,
  opts: { kindOverride?: "meeting" | "call" | "email" | "field_note"; forceNewAccount?: boolean },
  now = new Date(),
): Promise<RecordTouchpointResult> {
  // The rep's own Meeting/Call/Email pick (touchpoint-ui.tsx's toggle) always
  // wins over the model's kind guess, the same way an explicit account pick
  // always wins over account_confidence above: it decides which typed
  // HubSpot object autoFileEngagement files (Call vs Meeting; Email has none
  // yet and falls to Note), so a rep's own word for what just happened should
  // never be second-guessed by the extraction.
  if (opts.kindOverride) {
    parsed.activity.kind = opts.kindOverride === "email" ? "email_out" : opts.kindOverride;
  }

  // A FIELD NOTE LEAVES HERE AND NEVER TOUCHES AN ACTIVITY, AN ACCOUNT IT WAS
  // NOT ABOUT, OR HUBSPOT.
  //
  // This branch is the fix for 2026-09-02. Eight notes that were not customer
  // contacts went into the Visit tab that evening. With no kind for them, the
  // extractor picked meeting/call/email_out; with no business named, four
  // parked as needs_account, and that screen's exits are match-a-client,
  // create-a-business-from-Places, or leave it in the queue. Four took the
  // middle exit, so Goat Tree (the restaurant next door on State Street),
  // Unbound Design and Search Engine Pros were created as companies in the
  // SHARED portal to receive a note to self, graded, and had typed Meetings and
  // Calls filed on them. Every one of those steps was the code working as
  // written. What was missing was a way for a note to be about nothing.
  //
  // So: no activity row (nb_activities.account_id is `not null`, which is the
  // constraint that forces the invention of a company), no needs_account
  // parking, no HubSpot. A field note keeps its touchpoint credit in
  // nb_field_notes and its account link only when the note is genuinely about
  // that account.
  if (parsed.activity.kind === "field_note") {
    const noteAccountId = accountIdHint || (parsed.account_confidence === "high" ? parsed.account_id : null);
    const noteAccount = accountsRes.data.find((a) => a.account_id === noteAccountId);

    const tp = await insertTouchpoint({
      account_id: noteAccountId,
      raw_text: text,
      status: "parsed",
      account_match_confidence: accountIdHint ? "high" : parsed.account_confidence,
      parsed,
    });

    const fieldNote = await insertFieldNote({
      account_id: noteAccountId,
      touchpoint_id: tp.id,
      at: occurredAt ?? now.toISOString(),
      detail: parsed.activity.detail,
      raw_text: text,
      topic: noteAccountId ? "account" : "field",
    });

    // Verbatim into the queue, drained deliberately. Never executed on arrival.
    // A field note can still say "come back tomorrow", and that is a real
    // return visit: it joins the same queue, aimed at the route planner,
    // rather than becoming an event on Juan's calendar.
    const routeRows = returnVisitDirectiveRows(
      parsed.calendar_actions,
      fieldNote.id,
      noteAccountId,
      noteAccount?.name ?? null,
    );
    const directiveCount = await insertDirectives([
      ...agencyDirectiveRows(parsed.directives, fieldNote.id, noteAccountId),
      ...routeRows,
    ]);

    return {
      ok: true,
      touchpoint_id: tp.id,
      accountName: noteAccount?.name ?? null,
      accountId: noteAccount?.account_id ?? null,
      activityId: null,
      needsAccount: false,
      needsNextStep: false,
      isFieldNote: true,
      directiveCount,
      routeDirectives: routeRows.length,
      summary: parsed.activity.detail,
      peopleAdded: 0,
      peopleUpdated: 0,
      hubspotFiled: false,
      hubspotNoteId: null,
      hubspotError: null,
      hubspotLeaks: 0,
      companyPhoneFilled: null,
      companyPhoneConflict: null,
      accountFacts: null,
    };
  }

  // Explicit account picked by the rep in the UI always wins over the model's guess.
  // Only a "high" confidence match auto-files to an existing account; "low" is the
  // model's own hedge that the name match may be wrong (e.g. a same-named store in a
  // different city) and must park as needs_account like "none" does, not silently file.
  // forceNewAccount outranks even a "high" match: the rep is looking at the
  // storefront, the model is looking at a name.
  const accountId = opts.forceNewAccount
    ? null
    : accountIdHint || (parsed.account_confidence === "high" ? parsed.account_id : null);

  if (!accountId) {
    const tp = await insertTouchpoint({
      account_id: null,
      raw_text: text,
      status: "needs_account",
      account_match_confidence: parsed.account_confidence,
      parsed,
    });
    // A "low" guess still names a real candidate id; "none" never does (see
    // the extraction prompt above). Resolve it to a name now, once, rather
    // than making the client look it up.
    // Suppressed under forceNewAccount: offering a one-tap "YES!" match to an
    // existing account directly contradicts the rep having just declared this
    // one new, and re-opens the wrong-attach path the flag exists to close.
    // The safety net moves downstream and gets stronger there:
    // createBusinessFromPlace runs findPossibleDuplicates against the WHOLE
    // portal (not just Juan's book) and blocks on any hit.
    const matchAccount =
      !opts.forceNewAccount && parsed.account_confidence === "low" && parsed.account_id
        ? accountsRes.data.find((a) => a.account_id === parsed.account_id)
        : null;
    return {
      ok: true,
      touchpoint_id: tp.id,
      accountName: null,
      needsAccount: true,
      needsNextStep: false,
      summary: parsed.activity?.detail ?? text.slice(0, 140),
      businessNameGuess: parsed.business_name_guess ?? null,
      matchAccountId: matchAccount?.account_id ?? null,
      matchAccountName: matchAccount?.name ?? null,
      peopleAdded: 0,
      peopleUpdated: 0,
      routeDirectives: 0,
    };
  }

  const account = accountsRes.data.find((a) => a.account_id === accountId);
  const accountName = account?.name ?? null;

  // THE NEXT STEP IS NEVER LEFT TO CHANCE (Juan, 2026-09-10). A note that
  // resolved to a real account but never says what happens next parks here
  // instead of filing: the Visit tab asks him directly (see
  // resolveTouchpointNextStep below) rather than letting a HubSpot record go
  // out with no next step at all, which is what this whole gate exists to
  // stop. A field note never reaches this line (it returned above).
  if (!parsed.next_step || !parsed.next_step.trim()) {
    const parked = await insertTouchpoint({
      account_id: accountId,
      raw_text: text,
      status: "needs_next_step",
      account_match_confidence: accountIdHint ? "high" : parsed.account_confidence,
      parsed,
    });
    return {
      ok: true,
      touchpoint_id: parked.id,
      needsAccount: false,
      needsNextStep: true,
      accountId,
      accountName,
      summary: parsed.activity.detail,
    };
  }

  return finishTouchpoint({
    accountId,
    accountName,
    parsed,
    occurredAt,
    autoFileHubspot,
    rawText: text,
    accountMatchConfidence: accountIdHint ? "high" : parsed.account_confidence,
  });
}

/**
 * The shared tail once an account and a next step are both known: files the
 * nb_activities row, the close-signal check, account facts, contact
 * matching, the touchpoint row itself (inserted fresh on the straight-through
 * path, patched in place when the next-step gate above already parked one),
 * directives, outreach asks, and the HubSpot file. Both recordTouchpoint's
 * direct-match path and resolveTouchpointNextStep call this, so a change to
 * any one of those rules never has to be remembered in two places.
 */
async function finishTouchpoint(input: {
  accountId: string;
  accountName: string | null;
  parsed: ParsedTouchpoint;
  occurredAt?: string | null;
  autoFileHubspot: boolean;
  /** An existing parked row (status needs_next_step) to patch in place
   *  instead of inserting a new one. Undefined on the straight-through path,
   *  where no row exists yet. */
  existingTouchpointId?: string;
  rawText: string;
  accountMatchConfidence: string | null;
}): Promise<Extract<RecordTouchpointResult, { ok: true; needsAccount: false; needsNextStep: false }>> {
  const { accountId, accountName, parsed, occurredAt, autoFileHubspot } = input;

  const activity = await insertActivity({
    account_id: accountId,
    kind: parsed.activity.kind,
    direction: parsed.activity.direction,
    outcome: parsed.activity.outcome,
    detail: parsed.activity.detail,
    ...(occurredAt ? { at: occurredAt } : {}),
  });

  /* A LOG THAT SAID THE DOORS ARE SHUT (Juan, 2026-09-09: a meeting log "may
     signal the change to closed ... and should make the HubSpot account be
     marked as closed").

     Both halves of that, in order. The first is already done above: the
     activity is an ordinary row, so it counts toward this account's
     touchpoints exactly like any other visit, which is what Juan asked for
     and is why the closure is not filed as some separate non-touchpoint
     event. The second is an outward write to a portal shared with another
     rep, so it QUEUES rather than fires. HARD RULE 8: closed is evidence, not
     a routing decision. Nothing here sets closed_at or do_not_visit, the pin
     stays on the map, and set_lead_status.py --from-signals is the only door
     onward, dry by default and not on launchd.

     Never blocks the visit itself, same treatment as account facts above. */
  if (parsed.activity.outcome === "closed") {
    try {
      await insertCloseSignal({
        account_id: accountId,
        activity_id: activity.id,
        evidence: parsed.activity.detail,
      });
    } catch {
      /* the touchpoint is filed either way */
    }
  }

  // A fact stated about the business itself (hours, general phone/email)
  // updates nb_accounts regardless of whether this call also files to
  // HubSpot; the OS record is the source of truth either way. Never blocks
  // the visit itself on failure, same "enrichment, not a gate" treatment as
  // the contact loop below.
  let accountFacts: AccountFactsReport | null = null;
  try {
    accountFacts = await applyAccountFacts(accountId, parsed.account_facts);

    // A disagreement is never silently dropped, 2026-08-29: the old value
    // rides along as a plain line in the note filed for THIS visit (where a
    // human actually reads it) rather than an opaque JSON column nobody
    // opens. Mutating hubspot_summary before insertTouchpoint below means
    // both filing doors (the TS auto-file path and the clientos CLI, which
    // reads the same stored `parsed` back out of Supabase) pick it up for
    // free, no second place to keep this in sync.
    const oldVersionLines: string[] = [];
    if (accountFacts.business_hours?.status === "updated") {
      oldVersionLines.push(`Old version (business hours): ${formatBusinessHours(accountFacts.business_hours.old).replace(/\n/g, ", ")}`);
    }
    if (accountFacts.phone?.status === "updated") {
      oldVersionLines.push(`Old version (phone): ${accountFacts.phone.old}`);
    }
    if (accountFacts.email?.status === "updated") {
      oldVersionLines.push(`Old version (email): ${accountFacts.email.old}`);
    }
    if (oldVersionLines.length > 0) {
      parsed.activity.hubspot_summary = `${parsed.activity.hubspot_summary}\n\n${oldVersionLines.join("\n")}`;
    }

    // Hours have no field-level sync to HubSpot at all (AGENTS.md HARD RULE
    // 14); phone is owner:hubspot/push:fill, which would silently revert a
    // fresh number back on the next pull if HubSpot isn't told directly too.
    // Gated the same as the note itself: skip entirely for a door that asked
    // not to touch HubSpot yet (the clientos CLI's own dry-then-write step
    // handles this instead, see hubspot_notes.py's push_business_hours).
    if (autoFileHubspot) {
      const hoursChanged = accountFacts.business_hours?.status === "filled" || accountFacts.business_hours?.status === "updated";
      if (hoursChanged || accountFacts.phone || accountFacts.email) {
        const acc = await getAccount(accountId);
        const companyId = acc.data[0]?.hubspot_company_id;
        if (companyId) {
          if (hoursChanged) await pushBusinessHours(companyId, parsed.account_facts.business_hours!);
          if (accountFacts.phone) await pushCompanyPhone(companyId, accountFacts.phone.value);
          if (accountFacts.email) await pushCompanyEmail(companyId, accountFacts.email.value);
        }
      }
    }
  } catch {
    accountFacts = null;
  }

  const existing = await listContacts(accountId);
  let peopleAdded = 0;
  let peopleUpdated = 0;

  for (const p of parsed.people ?? []) {
    const outcome = await reconcileContact(accountId, existing.data, p);
    if (outcome === "added") peopleAdded += 1;
    else if (outcome === "updated") peopleUpdated += 1;
  }

  const tp = input.existingTouchpointId
    ? await finalizeTouchpointNextStep(input.existingTouchpointId, activity.id, parsed)
    : await insertTouchpoint({
        account_id: accountId,
        raw_text: input.rawText,
        status: "parsed",
        account_match_confidence: input.accountMatchConfidence,
        activity_id: activity.id,
        parsed,
      });

  // A real customer visit can carry BOTH a directive and a return visit, and
  // until now this path queued neither: insertDirectives only ran on the
  // field-note branch, so "go find their email" spoken during an actual visit
  // was parsed and then dropped, and "come back Thursday" went to a calendar
  // proposal that auto-pushed to Google Calendar. Both now land in
  // nb_directives, pending, for the human/route planner to drain.
  const routeRows = returnVisitDirectiveRows(
    parsed.calendar_actions,
    null,
    accountId,
    accountName,
  );
  const directiveCount = await insertDirectives([
    ...agencyDirectiveRows(parsed.directives, null, accountId),
    ...routeRows,
  ]);
  await fileOutreachAsks(parsed.outreach_asks, accountId, input.rawText);

  const hubspot = autoFileHubspot
    ? await autoFileEngagement(activity.id)
    : ({
        hubspotFiled: false,
        hubspotNoteId: null,
        hubspotError: null,
        hubspotLeaks: 0,
        companyPhoneFilled: null,
        companyPhoneConflict: null,
        companyCreatedId: null,
        contactsFiled: [],
      } satisfies HubspotFilingReport);

  await maybeMarkStopServiced(accountId, parsed.activity.kind, hubspot.hubspotFiled);

  return {
    ok: true,
    touchpoint_id: tp?.id ?? input.existingTouchpointId ?? "",
    accountName,
    accountId,
    // Carried back so a caller that scheduled this contact (the SDR page) can
    // link its own planning row to the real logged activity instead of
    // keeping a second opinion about what happened. See nb_sdr_schedule (0061).
    activityId: activity.id,
    needsAccount: false,
    needsNextStep: false,
    directiveCount,
    routeDirectives: routeRows.length,
    summary: parsed.activity.detail,
    peopleAdded,
    peopleUpdated,
    ...hubspot,
    accountFacts,
  };
}

/**
 * The one case that used to go straight to HubSpot with no human in the
 * loop at all: a matched account (his own pick, or the model's own "high"
 * confidence) with a stated next step. Field notes never touch HubSpot to
 * begin with; needs_account and needs_next_step already stop at their own
 * dedicated screen (AccountMatchResolver / NextStepResolver) before either
 * one ever reaches finishTouchpoint. Those three keep working exactly as
 * they always have; only this one path gets a hold-and-review step, since
 * it is the one that previously had none (Juan, 2026-09-15, after a note
 * filed to HubSpot he expected to be asked about first).
 */
export type TouchpointDraft = {
  rawText: string;
  accountIdHint: string | null;
  kind: "meeting" | "call" | "email";
  hubspotSummary: string;
  nextStep: string;
  contact: { firstName: string | null; lastName: string | null; title: string | null; phone: string | null; email: string | null } | null;
  /** What the agency queues on its own once this commits: return visits,
   *  agency directives, outreach asks, account-fact fills. Plain sentences,
   *  not a control -- editing what happens next means editing nextStep or
   *  the note itself, not this list. */
  automationNotes: string[];
  accountId: string;
  accountName: string;
  /** lib/priority.ts's live 0-100 score, the same number the map pin and the
   *  SDR row already show. Null when the account has no measured input yet,
   *  a real gap, never a guess. */
  priorityScore: number | null;
  priorityBand: "now" | "soon" | "later" | "unscored" | null;
  /** Opaque to the caller: sent back to commitTouchpointDraft verbatim, with
   *  overrides applied, so the commit runs the exact extraction this draft
   *  was built from rather than parsing the text a second time. */
  raw: ParsedTouchpoint;
};

export type PreviewResult =
  | { ok: true; needsReview: true; draft: TouchpointDraft }
  | { ok: true; needsReview: false; result: RecordTouchpointResult }
  | { ok: false; error: string };

export async function previewTouchpoint(
  rawText: string,
  accountIdHint?: string | null,
  opts: { kindOverride?: "meeting" | "call" | "email" | "field_note"; forceNewAccount?: boolean } = {},
): Promise<PreviewResult> {
  const text = rawText.trim();
  if (!text) return { ok: false, error: "Nothing to record." };
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured on this deployment." };

  // The priority book (dal.ts's getPriorityBook, the same whole-book
  // computation the map pin and SDR row read) runs alongside the extraction
  // call rather than after it: it does not depend on the parsed text at
  // all, and the model call is already the slow part of this round trip, so
  // this adds no visible wait of its own.
  const [accountsRes, priorityBook] = await Promise.all([listAccountsForMatching(), getPriorityBook()]);
  const candidates = accountsRes.data.map((a) => ({ id: a.account_id, name: a.name, city: null as string | null }));
  if (candidates.length === 0) return { ok: false, error: "No accounts to match against yet." };

  const now = new Date();
  let parsed: ParsedTouchpoint;
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: systemPrompt(now.toISOString(), candidates),
      messages: [{ role: "user", content: text }],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_touchpoint" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { ok: false, error: "Could not parse that note. Try rephrasing." };
    }
    parsed = toolUse.input as ParsedTouchpoint;
  } catch (err) {
    return { ok: false, error: `Parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (opts.kindOverride) {
    parsed.activity.kind = opts.kindOverride === "email" ? "email_out" : opts.kindOverride;
  }

  const resolvedAccountId = opts.forceNewAccount
    ? null
    : accountIdHint || (parsed.account_confidence === "high" ? parsed.account_id : null);
  const isReviewable =
    parsed.activity.kind !== "field_note" && Boolean(resolvedAccountId) && Boolean(parsed.next_step && parsed.next_step.trim());

  if (!isReviewable) {
    const result = await continueTouchpoint(text, parsed, accountsRes, accountIdHint, null, true, opts, now);
    return { ok: true, needsReview: false, result };
  }

  const accountId = resolvedAccountId!;
  const account = accountsRes.data.find((a) => a.account_id === accountId);
  const accountName = account?.name ?? "";
  const priority = priorityBook.byId.get(accountId) ?? null;
  const p0 = parsed.people?.[0] ?? null;

  const automationNotes: string[] = [];
  if ((parsed.calendar_actions?.length ?? 0) > 0) {
    automationNotes.push(
      `${parsed.calendar_actions.length} return visit${parsed.calendar_actions.length === 1 ? "" : "s"} queued for the route planner`,
    );
  }
  if (parsed.directives?.length) {
    automationNotes.push(`${parsed.directives.length} agency directive${parsed.directives.length === 1 ? "" : "s"} queued`);
  }
  if (parsed.outreach_asks?.length) {
    automationNotes.push(`${parsed.outreach_asks.length} outreach ask${parsed.outreach_asks.length === 1 ? "" : "s"} sent to Outbound`);
  }
  if (parsed.account_facts?.business_hours || parsed.account_facts?.phone || parsed.account_facts?.email) {
    automationNotes.push("Business hours, phone, or email updated on the account");
  }
  if (parsed.activity.outcome === "closed") {
    automationNotes.push("Flags the account as possibly closed, for HQ to review");
  }

  const draft: TouchpointDraft = {
    rawText: text,
    accountIdHint: accountIdHint ?? null,
    kind: parsed.activity.kind === "email_out" ? "email" : (parsed.activity.kind as "meeting" | "call"),
    hubspotSummary: parsed.activity.hubspot_summary || parsed.activity.detail,
    nextStep: parsed.next_step ?? "",
    contact: p0
      ? { firstName: p0.first_name, lastName: p0.last_name, title: p0.title, phone: p0.phone, email: p0.email }
      : null,
    automationNotes,
    accountId,
    accountName,
    priorityScore: priority?.score ?? null,
    priorityBand: priority?.band ?? null,
    raw: parsed,
  };

  return { ok: true, needsReview: true, draft };
}

/**
 * The 5-second review's "Looks good" (or its own silent timeout): runs the
 * exact same continueTouchpoint tail recordTouchpoint always has, over the
 * draft's already-extracted `parsed`, patched with whatever Juan changed on
 * screen. An untouched field is not in `overrides` at all, never sent back
 * as its own unchanged value, so a draft nobody edited commits byte-identical
 * to what previewTouchpoint built.
 */
export async function commitTouchpointDraft(
  draft: TouchpointDraft,
  overrides: {
    hubspotSummary?: string;
    nextStep?: string;
    contact?: { firstName: string | null; lastName: string | null; title: string | null; phone: string | null; email: string | null };
  } = {},
): Promise<Extract<RecordTouchpointResult, { ok: true; needsAccount: false; needsNextStep: false }>> {
  const parsed = draft.raw;
  if (overrides.hubspotSummary !== undefined) parsed.activity.hubspot_summary = overrides.hubspotSummary;
  if (overrides.nextStep !== undefined) parsed.next_step = overrides.nextStep;
  if (overrides.contact) {
    const c = overrides.contact;
    if (parsed.people[0]) {
      parsed.people[0] = { ...parsed.people[0], first_name: c.firstName, last_name: c.lastName, title: c.title, phone: c.phone, email: c.email };
    } else if (c.firstName || c.lastName || c.title || c.phone || c.email) {
      parsed.people = [
        {
          first_name: c.firstName,
          last_name: c.lastName,
          title: c.title,
          role_tag: null,
          is_decision_maker: false,
          email: c.email,
          phone: c.phone,
          preferences: null,
        },
        ...parsed.people,
      ];
    }
  }

  return finishTouchpoint({
    accountId: draft.accountId,
    accountName: draft.accountName,
    parsed,
    occurredAt: null,
    autoFileHubspot: true,
    rawText: draft.rawText,
    accountMatchConfidence: draft.accountIdHint ? "high" : parsed.account_confidence,
  });
}

export type ResolveResult =
  | {
      ok: true;
      accountId: string;
      accountName: string;
      summary: string;
      peopleAdded: number;
      peopleUpdated: number;
      directiveCount: number;
      routeDirectives: number;
      hubspotFiled: boolean;
      hubspotNoteId: string | null;
      hubspotError: string | null;
      hubspotLeaks: number;
      companyPhoneFilled: string | null;
      companyPhoneConflict: string | null;
    }
  | { ok: false; error: string };

/**
 * A touchpoint that parked as needs_account, now that an account exists for
 * it (Juan confirmed a match, or lib/new-account-actions.ts just created one
 * from Google Places). Re-uses the SAME parse the touchpoint already carries
 * rather than calling Claude a second time: he already saw that summary once,
 * asking the model to redo it risks a second, slightly different answer to
 * the exact words he already confirmed.
 */
export async function resolveTouchpointToAccount(
  touchpointId: string,
  accountId: string,
  accountName: string,
): Promise<ResolveResult> {
  const tp = await getTouchpointById(touchpointId);
  if (!tp) return { ok: false, error: "That touchpoint no longer exists." };
  if (tp.status !== "needs_account") {
    return { ok: false, error: `Touchpoint is already ${tp.status}, not needs_account.` };
  }
  const parsed = tp.parsed as ParsedTouchpoint | null;
  if (!parsed) return { ok: false, error: "That touchpoint has no parsed data to file." };
  // The create-a-business exit is exactly how four notes to self became
  // companies in the shared portal on 2026-09-02. A field note has no business
  // to be resolved to, and reaching this function with one means the capture
  // path leaked, so it stops here rather than filing an activity and an
  // engagement on whatever account the caller had in hand.
  if (parsed.activity.kind === "field_note") {
    return { ok: false, error: "That is a field note. It stays in the OS and is never filed to an account." };
  }

  const activity = await insertActivity({
    account_id: accountId,
    kind: parsed.activity.kind,
    direction: parsed.activity.direction,
    outcome: parsed.activity.outcome,
    detail: parsed.activity.detail,
  });

  const linked = await finalizeTouchpointAccount(touchpointId, accountId, activity.id);
  if (!linked) return { ok: false, error: "Touchpoint was already resolved by another request." };

  const existing = await listContacts(accountId);
  let peopleAdded = 0;
  let peopleUpdated = 0;
  for (const p of parsed.people ?? []) {
    const outcome = await reconcileContact(accountId, existing.data, p);
    if (outcome === "added") peopleAdded += 1;
    else if (outcome === "updated") peopleUpdated += 1;
  }

  // Same queue as the straight-through path above. This note parked as
  // needs_account when it was spoken, so its follow-up has been waiting for an
  // account to attach to; now it has one, it goes to the route planner.
  const routeRows = returnVisitDirectiveRows(parsed.calendar_actions, null, accountId, accountName);
  const directiveCount = await insertDirectives([
    ...agencyDirectiveRows(parsed.directives, null, accountId),
    ...routeRows,
  ]);
  await fileOutreachAsks(parsed.outreach_asks, accountId, tp.raw_text);

  const hubspot = await autoFileEngagement(activity.id);

  await maybeMarkStopServiced(accountId, parsed.activity.kind, hubspot.hubspotFiled);

  revalidatePath("/nutribiotic/visit");
  return {
    ok: true,
    accountId,
    accountName,
    summary: parsed.activity.detail,
    peopleAdded,
    peopleUpdated,
    directiveCount,
    routeDirectives: routeRows.length,
    ...hubspot,
  };
}

/**
 * Juan answers the next-step popup (Visit tab's NextStepResolver). The
 * account is already known here: the gate in recordTouchpoint above only
 * ever parks a touchpoint at needs_next_step once it has a resolved
 * account_id, so this only needs the one line he typed, or the explicit "no
 * follow-up needed" the popup offers as its own button rather than a silent
 * default. Runs through the same finishTouchpoint tail as the straight-
 * through path, so accountFacts, the close-signal check, contact matching,
 * directives and the HubSpot file behave identically no matter which door
 * supplied the next step.
 */
export async function resolveTouchpointNextStep(
  touchpointId: string,
  nextStepText: string,
): Promise<ResolveResult> {
  const stated = nextStepText.trim();
  if (!stated) return { ok: false, error: "Type the next step, or tap None needed." };

  const tp = await getTouchpointById(touchpointId);
  if (!tp) return { ok: false, error: "That touchpoint no longer exists." };
  if (tp.status !== "needs_next_step") {
    return { ok: false, error: `Touchpoint is already ${tp.status}, not needs_next_step.` };
  }
  if (!tp.account_id) return { ok: false, error: "That touchpoint has no account to file against." };
  const parsed = tp.parsed as ParsedTouchpoint | null;
  if (!parsed) return { ok: false, error: "That touchpoint has no parsed data to file." };

  parsed.next_step = stated;

  const accountRes = await getAccount(tp.account_id);
  const account = accountRes.data[0];
  if (!account) return { ok: false, error: "That account no longer exists." };

  const filed = await finishTouchpoint({
    accountId: tp.account_id,
    accountName: account.name,
    parsed,
    autoFileHubspot: true,
    existingTouchpointId: touchpointId,
    rawText: tp.raw_text,
    accountMatchConfidence: tp.account_match_confidence,
  });

  revalidatePath("/nutribiotic/visit");
  return {
    ok: true,
    accountId: tp.account_id,
    accountName: filed.accountName ?? account.name,
    summary: filed.summary,
    peopleAdded: filed.peopleAdded,
    peopleUpdated: filed.peopleUpdated,
    directiveCount: filed.directiveCount ?? 0,
    routeDirectives: filed.routeDirectives ?? 0,
    hubspotFiled: filed.hubspotFiled,
    hubspotNoteId: filed.hubspotNoteId,
    hubspotError: filed.hubspotError,
    hubspotLeaks: filed.hubspotLeaks,
    companyPhoneFilled: filed.companyPhoneFilled,
    companyPhoneConflict: filed.companyPhoneConflict,
  };
}
