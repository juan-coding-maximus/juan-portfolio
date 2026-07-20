"use server";

import { getAccount, listActivities, listContacts, type Account, type Activity, type Contact } from "./dal";

export type AccountDetailData = {
  account: Account;
  activities: Activity[];
  contacts: Contact[];
} | null;

/** Feeds the pop-up account modal. Same DAL calls the standalone /account/[id]
 * page makes, so the two hosts never drift. */
export async function getAccountDetail(id: string): Promise<AccountDetailData> {
  const [acc, acts, contacts] = await Promise.all([getAccount(id), listActivities(id), listContacts(id)]);
  const a = acc.data[0];
  if (!a) return null;
  return { account: a, activities: acts.data, contacts: contacts.data };
}
