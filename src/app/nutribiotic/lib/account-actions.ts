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
import { pushPotentialRead } from "./hubspot-company";

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

export type PotentialPushOutcome = { hubspotFiled: boolean; hubspotError: string | null };

/**
 * Sets (or clears, grade=null) Juan's own potential read from the account
 * card. Setting a letter also pushes it straight onto HubSpot's
 * potential__cloned_, overwriting HQ's grade there (see pushPotentialRead).
 * Clearing stays local only. Returns null when there is nothing to report
 * (cleared, or no linked company yet), an outcome otherwise for the card's
 * SuccessNote.
 */
export async function setPotentialJuan(id: string, grade: Tier | null): Promise<PotentialPushOutcome | null> {
  const account = await setAccountPotentialJuan(id, grade);
  if (grade === null) return null;
  if (!account?.hubspot_company_id) {
    return { hubspotFiled: false, hubspotError: "No linked HubSpot company on this account yet." };
  }

  const result = await pushPotentialRead(account.hubspot_company_id, grade);
  if (result.ok) return { hubspotFiled: true, hubspotError: null };

  const error =
    result.reason === "not_juans"
      ? "This company isn't in your book in the portal."
      : result.reason === "not_configured"
        ? "HubSpot push isn't enabled on this deployment."
        : (result.error ?? "unknown error");
  return { hubspotFiled: false, hubspotError: error };
}
