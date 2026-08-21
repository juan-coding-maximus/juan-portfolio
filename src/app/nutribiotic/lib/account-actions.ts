"use server";

import {
  getAccount,
  listActivities,
  listContacts,
  listPurchases,
  setAccountPotentialJuan,
  type Account,
  type Activity,
  type Contact,
  type PurchaseLine,
  type PurchaseOrder,
  type Tier,
} from "./dal";

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
