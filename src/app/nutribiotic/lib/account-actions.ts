"use server";

import { revalidatePath } from "next/cache";
import { asksCollide, composeAsk } from "./ask-compose";
import {
  applyAccountFacts,
  getAccount,
  getVoiceContext,
  insertAskDraft,
  listActivities,
  listAskKeys,
  listContacts,
  listPurchases,
  resolveDirective,
  setAccountPotentialJuan,
  setAccountReadiness,
  type Account,
  type Activity,
  type Contact,
  type PurchaseLine,
  type PurchaseOrder,
  type Tier,
} from "./dal";
import type { Readiness } from "./priority";

export type AccountDetailData = {
  account: Account;
  activities: Activity[];
  contacts: Contact[];
  orders: PurchaseOrder[];
  lines: PurchaseLine[];
} | null;

/** Feeds the pop-up account modal. Same DAL calls the standalone /account/[id]
 * page makes, so the two hosts never drift. */
export async function getAccountDetail(id: string): Promise<AccountDetailData> {
  const [acc, acts, contacts, purchases] = await Promise.all([
    getAccount(id),
    listActivities(id),
    listContacts(id),
    listPurchases(id),
  ]);
  const a = acc.data[0];
  if (!a) return null;
  return { account: a, activities: acts.data, contacts: contacts.data, orders: purchases.orders, lines: purchases.lines };
}

/**
 * Sets (or clears, grade=null) Juan's own potential read from the account
 * card. Local only: reaching HubSpot is bridges/nutribiotic/hubspot_sync.py's
 * job, not this action's. Setting a letter is picked up by that worker's
 * 60-second --watch loop (nutribiotic/config/hubspot_fields.json's
 * potential_juan entry, push:"own") and pushed onto potential__cloned_,
 * overwriting HQ's grade there. Clearing is never pushed: the loop's entry
 * only fires for a non-null local value.
 */
export async function setPotentialJuan(id: string, grade: Tier | null): Promise<void> {
  await setAccountPotentialJuan(id, grade);
}

/**
 * Sets (or clears, readiness=null) the rep's own readiness tag from the call
 * or visit capture box, migration 0069. Local only, never reaches HubSpot;
 * it feeds lib/priority.ts's score as a stated point adjustment the next time
 * the priority book is read, never a background push.
 */
export async function setReadiness(id: string, readiness: Readiness | null): Promise<void> {
  await setAccountReadiness(id, readiness);
}

/**
 * A rep correcting the phone number by hand from the SDR panel, same "fix
 * the record, not a note" rule as everywhere else (AGENTS.md, memory
 * feedback_fix-root-cause-not-a-note). Routed through applyAccountFacts so it
 * stamps enrichment_status.phone.source_tier = "manual_note", the same top
 * rank a dictated visit/call note gets: a number Juan just heard or read off
 * the door outranks whatever an old ERP import or a Places scrape has on
 * file, and a later automated pass won't quietly overwrite it back.
 */
export async function setAccountPhone(id: string, phone: string): Promise<void> {
  await applyAccountFacts(id, { business_hours: null, phone, email: null });
}

export type DraftAccountPitchResult =
  | { status: "drafted" }
  | { status: "already_queued" }
  | { status: "not_written"; reason: string };

/**
 * The account profile's "Draft outreach" button (2026-09-23): reuse the same
 * composer that turns a logged visit's ask into a pitch (lib/ask-compose.ts,
 * called from touchpoint.ts's fileOutreachAsks), but for an account whose
 * Gap Selling summary (current_state/future_state/impact, the Now/Opening/
 * Impact card on the profile) IS the opening, even when no customer has
 * asked for anything yet. Same grounding gate either way: composeAsk may
 * only reword what current_state/future_state/impact already say, and an
 * account with none of the three on file is refused before a model is ever
 * called rather than left to invent an opening.
 *
 * A missing recipient does not block this (Juan, 2026-09-23): an account
 * with no email or phone on file still gets a written draft, meant to be
 * pasted into the store's own website contact form -- see the "no email or
 * phone on file" path in outbound-ui.tsx's DraftCard.
 *
 * Idempotent the same way fileOutreachAsks is: a second click on an account
 * that already has this exact opening queued (dismissed or not) finds it via
 * asksCollide rather than filing a duplicate every time Juan reopens the
 * profile.
 */
export async function draftAccountPitch(id: string): Promise<DraftAccountPitchResult> {
  const [accRes, contactsRes, alreadyFiled, voice] = await Promise.all([
    getAccount(id),
    listContacts(id),
    listAskKeys(id),
    getVoiceContext(id),
  ]);
  const account = accRes.data[0];
  if (!account) return { status: "not_written", reason: "Account not found." };

  const opening = account.future_state || account.impact || account.current_state;
  if (!opening) {
    return { status: "not_written", reason: "Nothing on file yet describes an opening for this account." };
  }
  if (alreadyFiled.some((r) => asksCollide(r.source_ask, opening))) {
    return { status: "already_queued" };
  }

  const noteText = [
    account.current_state ? `Now: ${account.current_state}` : null,
    account.future_state ? `Opening: ${account.future_state}` : null,
    account.impact ? `Impact: ${account.impact}` : null,
  ]
    .filter((v): v is string => Boolean(v))
    .join("\n\n");

  const contacts = contactsRes.data
    .map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
      title: c.title,
      email: c.email,
    }))
    .filter((c) => c.name);

  const composed = await composeAsk({
    ask: opening,
    noteText,
    account: { id: account.id, name: account.name, city: account.city, email: account.email },
    contacts,
    voice,
  });
  await insertAskDraft({ account_id: id, ask: opening, composed });
  revalidatePath("/nutribiotic/outbound");

  return composed.written ? { status: "drafted" } : { status: "not_written", reason: composed.reason };
}

/**
 * The map's Suggested returns panel offering "Generate outbound" on an
 * account that has no Gap Selling summary on file yet -- draftAccountPitch's
 * opening -- so it takes Juan's own typed reason instead. Same composer, same
 * grounding gate: what he just typed is the only source text, and composeAsk
 * may only reword what it says, exactly as it may only reword
 * current_state/future_state/impact on the profile's own button. Not a
 * looser path, a different source for the identical rule.
 */
export async function draftAccountPitchFromReason(id: string, reason: string): Promise<DraftAccountPitchResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { status: "not_written", reason: "No reason given." };

  const [accRes, contactsRes, alreadyFiled, voice] = await Promise.all([
    getAccount(id),
    listContacts(id),
    listAskKeys(id),
    getVoiceContext(id),
  ]);
  const account = accRes.data[0];
  if (!account) return { status: "not_written", reason: "Account not found." };
  if (alreadyFiled.some((r) => asksCollide(r.source_ask, trimmed))) {
    return { status: "already_queued" };
  }

  const contacts = contactsRes.data
    .map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
      title: c.title,
      email: c.email,
    }))
    .filter((c) => c.name);

  const composed = await composeAsk({
    ask: trimmed,
    noteText: trimmed,
    account: { id: account.id, name: account.name, city: account.city, email: account.email },
    contacts,
    voice,
  });
  await insertAskDraft({ account_id: id, ask: trimmed, composed });
  revalidatePath("/nutribiotic/outbound");

  return composed.written ? { status: "drafted" } : { status: "not_written", reason: composed.reason };
}

/**
 * Marks a return-visit directive handled from the Suggested returns panel,
 * whichever of its three actions Juan actually took. See dal.ts's
 * resolveDirective: same stamp follow_through.py leaves when it routes one
 * itself, so nutribiotic-route-planner does not offer the same account a
 * second time.
 */
export async function resolveReturnDirective(id: string, resolution: string): Promise<void> {
  await resolveDirective(id, resolution);
}
