"use server";

import {
  applyAccountFacts,
  getAccount,
  listActivities,
  listContacts,
  listPurchases,
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
