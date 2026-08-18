/**
 * Record a touchpoint. Juan types what just happened; this turns it into a
 * clean activity log entry, fills contact detail, files the activity into
 * HubSpot as a Note/Call/Meeting (autoFileEngagement, below), and drafts
 * calendar follow-ups for him to approve.
 *
 * NO FABRICATION (agency AGENTS.md principle 2): the extraction prompt is
 * instructed to pull only what the text actually states, never invent a name,
 * email, phone, or date. Contact detail is filled, never overwritten, so a
 * bad parse can only add a blank field, never clobber a true one. Calendar
 * proposals are the one piece that can affect something outside this app
 * (Juan's real Google Calendar), so per principle 1 they stay a GATED draft:
 * this writes 'pending' rows only, nothing is created until Juan approves one
 * (see setCalendarProposalStatus) and bridges/nutribiotic/calendar_sync.py
 * turns an approved row into a real event, mirroring gcal_client.py's own
 * confirm=True gate.
 */

"use server";

import Anthropic from "@anthropic-ai/sdk";
import {
  finalizeTouchpointAccount,
  getTouchpointById,
  insertActivity,
  insertCalendarProposal,
  insertContact,
  insertTouchpoint,
  listAccounts,
  listContacts,
  patchContact,
} from "./dal";
import { Blocked, runEngagement } from "./hubspot-engagement";

/**
 * File the just-logged activity straight into HubSpot, no click. One
 * touchpoint should mean one thing happened: the account, the activity, and
 * the note, all at once, the same "hands-off" contract the clientos skill
 * already gives Juan from the CLI (see .claude/skills/clientos/SKILL.md) and
 * AGENTS.md's "Automate housekeeping" standing order. A filing failure never
 * unwinds the touchpoint itself, the activity just stays unfiled and drops
 * into the Visit tab's manual queue below for a retry.
 */
async function autoFileEngagement(
  activityId: number,
): Promise<{ hubspotFiled: boolean; hubspotNoteId: string | null; hubspotError: string | null }> {
  try {
    const filed = await runEngagement(activityId, { write: true });
    return {
      hubspotFiled: filed.wrote || Boolean(filed.alreadyFiledId),
      hubspotNoteId: filed.noteId ?? filed.alreadyFiledId,
      hubspotError: null,
    };
  } catch (e) {
    return {
      hubspotFiled: false,
      hubspotNoteId: null,
      hubspotError: e instanceof Blocked ? e.message : e instanceof Error ? e.message : String(e),
    };
  }
}

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

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

type ParsedCalendarAction = {
  kind: "meeting" | "reminder" | "visit";
  title: string;
  when_iso: string | null;
  duration_minutes: number | null;
  notes: string | null;
};

type ParsedTouchpoint = {
  account_id: string | null;
  account_confidence: "high" | "low" | "none";
  business_name_guess: string | null;
  activity: {
    kind: string;
    direction: "outbound" | "inbound" | "internal";
    outcome: string | null;
    detail: string;
  };
  people: ParsedPerson[];
  calendar_actions: ParsedCalendarAction[];
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
            ],
          },
          direction: { type: "string", enum: ["outbound", "inbound", "internal"] },
          outcome: {
            type: ["string", "null"],
            enum: ["reached", "no_decision_maker", "closed", "declined", "reschedule", "no_answer", "left_sample", null],
          },
          detail: {
            type: "string",
            description: "what the rep said, kept in the rep's own first-person words ('I called...', not 'The rep called...'). Trim filler words and clean up punctuation/capitalization/structure, but never paraphrase into third person and never drop a stated fact.",
          },
        },
        required: ["kind", "direction", "detail"],
      },
      people: {
        type: "array",
        items: {
          type: "object",
          properties: {
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
            role_tag: { type: ["string", "null"], enum: ["buyer", "owner", "manager", "clerk", "other", null] },
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
    },
    required: ["account_confidence", "business_name_guess", "activity", "people", "calendar_actions"],
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
- Only include a person in "people" if the note actually names them or clearly describes a specific individual (a title alone like "the manager" with no name is still worth including with first_name/last_name null, if a real detail like an email or a stated preference is attached to them).
- Only include a calendar_action if the note describes something that should go on a calendar (a scheduled meeting, an explicit follow-up date, a planned return visit). Do not invent a follow-up that was not mentioned.
- when_iso must be a real resolved timestamp if a specific day/time was stated; if only vague ("follow up soon") leave it null and say so in notes.`;
}

export type RecordTouchpointResult =
  | {
      ok: true;
      touchpoint_id: string;
      accountName: string | null;
      needsAccount: false;
      summary: string;
      peopleAdded: number;
      peopleUpdated: number;
      calendarProposals: number;
      hubspotFiled: boolean;
      hubspotNoteId: string | null;
      hubspotError: string | null;
    }
  | {
      ok: true;
      touchpoint_id: string;
      accountName: null;
      needsAccount: true;
      summary: string;
      businessNameGuess: string | null;
      peopleAdded: 0;
      peopleUpdated: 0;
      calendarProposals: 0;
    }
  | { ok: false; error: string };

export async function recordTouchpoint(
  rawText: string,
  accountIdHint?: string | null,
  occurredAt?: string | null,
  opts: { autoFileHubspot?: boolean } = {},
): Promise<RecordTouchpointResult> {
  const autoFileHubspot = opts.autoFileHubspot ?? true;
  const text = rawText.trim();
  if (!text) return { ok: false, error: "Nothing to record." };
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured on this deployment." };

  // Juan's book only, which listAccounts() now enforces. Matching a spoken store name
  // against the other rep's accounts could file a touchpoint into his book.
  const accountsRes = await listAccounts({ limit: 500 });
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

  // Explicit account picked by the rep in the UI always wins over the model's guess.
  const accountId = accountIdHint || (parsed.account_confidence !== "none" ? parsed.account_id : null);

  if (!accountId) {
    const tp = await insertTouchpoint({
      account_id: null,
      raw_text: text,
      status: "needs_account",
      account_match_confidence: parsed.account_confidence,
      parsed,
    });
    return {
      ok: true,
      touchpoint_id: tp.id,
      accountName: null,
      needsAccount: true,
      summary: parsed.activity?.detail ?? text.slice(0, 140),
      businessNameGuess: parsed.business_name_guess ?? null,
      peopleAdded: 0,
      peopleUpdated: 0,
      calendarProposals: 0,
    };
  }

  const account = accountsRes.data.find((a) => a.account_id === accountId);

  const activity = await insertActivity({
    account_id: accountId,
    kind: parsed.activity.kind,
    direction: parsed.activity.direction,
    outcome: parsed.activity.outcome,
    detail: parsed.activity.detail,
    ...(occurredAt ? { at: occurredAt } : {}),
  });

  const existing = await listContacts(accountId);
  let peopleAdded = 0;
  let peopleUpdated = 0;

  for (const p of parsed.people ?? []) {
    const nameKey = (s: string | null) => (s ?? "").trim().toLowerCase();
    const match = existing.data.find(
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
      if (Object.keys(patch).length > 0) {
        await patchContact(match.id, patch);
        peopleUpdated += 1;
      }
    } else if (p.first_name || p.last_name || p.title) {
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
      peopleAdded += 1;
    }
  }

  let calendarProposals = 0;
  const tp = await insertTouchpoint({
    account_id: accountId,
    raw_text: text,
    status: "parsed",
    account_match_confidence: accountIdHint ? "high" : parsed.account_confidence,
    activity_id: activity.id,
    parsed,
  });

  for (const ca of parsed.calendar_actions ?? []) {
    await insertCalendarProposal({
      touchpoint_id: tp.id,
      account_id: accountId,
      kind: ca.kind,
      title: account ? `${account.name}: ${ca.title}` : ca.title,
      starts_at: ca.when_iso,
      duration_minutes: ca.duration_minutes ?? 60,
      notes: ca.notes,
    });
    calendarProposals += 1;
  }

  const hubspot = autoFileHubspot
    ? await autoFileEngagement(activity.id)
    : { hubspotFiled: false, hubspotNoteId: null, hubspotError: null };

  return {
    ok: true,
    touchpoint_id: tp.id,
    accountName: account?.name ?? null,
    needsAccount: false,
    summary: parsed.activity.detail,
    peopleAdded,
    peopleUpdated,
    calendarProposals,
    ...hubspot,
  };
}

export type ResolveResult =
  | {
      ok: true;
      accountName: string;
      summary: string;
      peopleAdded: number;
      peopleUpdated: number;
      calendarProposals: number;
      hubspotFiled: boolean;
      hubspotNoteId: string | null;
      hubspotError: string | null;
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
    const nameKey = (s: string | null) => (s ?? "").trim().toLowerCase();
    const match = existing.data.find(
      (c) =>
        nameKey(c.first_name) === nameKey(p.first_name) &&
        nameKey(c.last_name) === nameKey(p.last_name) &&
        (nameKey(p.first_name) || nameKey(p.last_name)) !== "",
    );
    if (match) {
      const patch: Record<string, string | boolean> = {};
      if (!match.title && p.title) patch.title = p.title;
      if (!match.role_tag && p.role_tag) patch.role_tag = p.role_tag;
      if (!match.email && p.email) patch.email = p.email;
      if (!match.phone && p.phone) patch.phone = p.phone;
      if (!match.is_decision_maker && p.is_decision_maker) patch.is_decision_maker = true;
      if (Object.keys(patch).length > 0) {
        await patchContact(match.id, patch);
        peopleUpdated += 1;
      }
    } else if (p.first_name || p.last_name || p.title) {
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
      peopleAdded += 1;
    }
  }

  let calendarProposals = 0;
  for (const ca of parsed.calendar_actions ?? []) {
    await insertCalendarProposal({
      touchpoint_id: touchpointId,
      account_id: accountId,
      kind: ca.kind,
      title: `${accountName}: ${ca.title}`,
      starts_at: ca.when_iso,
      duration_minutes: ca.duration_minutes ?? 60,
      notes: ca.notes,
    });
    calendarProposals += 1;
  }

  const hubspot = await autoFileEngagement(activity.id);

  return { ok: true, accountName, summary: parsed.activity.detail, peopleAdded, peopleUpdated, calendarProposals, ...hubspot };
}
