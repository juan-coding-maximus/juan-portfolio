"use server";

/**
 * SDR page actions. The page schedules calls/visits into days, dials out with
 * a plain tel: link (see lib/sdr-ui.tsx for why nothing fancier), logs what
 * happened through the SAME extractor /visit uses, and can flag an account to
 * Outbound. Nothing here files a second, competing record of what happened on
 * a call, that stays touchpoint.ts's job alone (nutribiotic/AGENTS.md,
 * Capture doors).
 */

import { revalidatePath } from "next/cache";
import {
  getAccount,
  insertSdrScheduleItem,
  listActivities,
  listContacts,
  rescheduleSdrScheduleItem,
  searchOwnedAccounts,
  searchOwnedContacts,
  setSdrScheduleStatus,
  type NewSdrScheduleItem,
  type SdrScheduleItem,
} from "./dal";

export type SdrSearchHit = {
  accountId: string;
  accountName: string;
  city: string | null;
  phone: string | null;
  /** Set only when this hit matched on a PERSON's name rather than the
   *  business name, so the result line can say who, at which business,
   *  instead of just the business twice. */
  contactName: string | null;
  contactTitle: string | null;
};

/**
 * One search bar, both a business name and a person's name, no mode toggle
 * (Juan's ask, 2026-09-08: "without any toggles"). Runs both lookups in
 * parallel and dedupes by account, a company-name hit and a person-name hit
 * on the SAME account show once, not twice, with the contact attached to
 * the account row rather than as a second card.
 */
export async function searchSdrClients(q: string): Promise<SdrSearchHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const [accounts, contacts] = await Promise.all([searchOwnedAccounts(query, 6), searchOwnedContacts(query, 6)]);
  const byAccount = new Map<string, SdrSearchHit>();
  for (const a of accounts.data) {
    byAccount.set(a.id, { accountId: a.id, accountName: a.name, city: a.city, phone: a.phone, contactName: null, contactTitle: null });
  }
  for (const c of contacts.data) {
    const existing = byAccount.get(c.account_id);
    if (existing && !existing.contactName) {
      byAccount.set(c.account_id, { ...existing, contactName: c.name, contactTitle: c.title });
    } else if (!existing) {
      byAccount.set(c.account_id, {
        accountId: c.account_id,
        accountName: c.account_name,
        city: c.city,
        phone: c.phone,
        contactName: c.name,
        contactTitle: c.title,
      });
    }
  }
  return [...byAccount.values()].slice(0, 8);
}

export type SdrAccountPanel = {
  id: string;
  name: string;
  channel: string;
  street: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  lifecycle: string;
  potentialJuan: string | null;
  quirks: string | null;
  currentState: string | null;
  lastOrderAt: string | null;
  hubspotCompanyId: string | null;
  contacts: { id: string; name: string; title: string | null; phone: string | null; email: string | null; isDecisionMaker: boolean }[];
  lastActivity: { at: string; kind: string; detail: string | null } | null;
};

/**
 * The account context for one SDR call, deliberately narrow. Juan's ask,
 * 2026-09-08: "a lot of information about the business... but less crowded,
 * only the important information", not the full /nutribiotic/account/[id]
 * page (activities table, order history, everything AccountDetailBody
 * shows). This picks the fields that matter for a cold or warm call, in the
 * seconds before he dials: what the business is, how to reach it, what's
 * already on file at HubSpot, who's there, and the one most recent thing
 * that actually happened.
 */
export async function getSdrAccountPanel(accountId: string): Promise<SdrAccountPanel | null> {
  const [accRes, contactsRes, activitiesRes] = await Promise.all([
    getAccount(accountId),
    listContacts(accountId),
    listActivities(accountId, 1),
  ]);
  const a = accRes.data[0];
  if (!a) return null;
  const last = activitiesRes.data[0] ?? null;
  return {
    id: a.id,
    name: a.name,
    channel: a.channel,
    street: a.street,
    city: a.city,
    phone: a.phone,
    website: a.website,
    lifecycle: a.lifecycle,
    potentialJuan: a.potential_juan,
    quirks: a.quirks,
    currentState: a.current_state,
    lastOrderAt: a.last_order_at,
    hubspotCompanyId: a.hubspot_company_id,
    contacts: contactsRes.data.map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed contact",
      title: c.title,
      phone: c.phone,
      email: c.email,
      isDecisionMaker: c.is_decision_maker,
    })),
    lastActivity: last ? { at: last.at, kind: last.kind, detail: last.detail } : null,
  };
}

export async function searchSdrAccounts(query: string) {
  const res = await searchOwnedAccounts(query);
  return res.data;
}

export async function addSdrScheduleItem(input: NewSdrScheduleItem): Promise<SdrScheduleItem> {
  const row = await insertSdrScheduleItem(input);
  revalidatePath("/nutribiotic/sdr");
  return row;
}

/**
 * Move one scheduled call or visit to another day. Writes
 * nb_sdr_schedule.scheduled_date, the field the queue actually groups and
 * orders by, and stamps rescheduled_at so the 30-minute follow-through pass
 * knows a human has already answered for this account and stands down (see
 * dal.ts's rescheduleSdrScheduleItem and bridges/nutribiotic/follow_through.py).
 */
export async function rescheduleSdrItem(id: string, scheduledDate: string): Promise<SdrScheduleItem> {
  const row = await rescheduleSdrScheduleItem(id, scheduledDate);
  revalidatePath("/nutribiotic/sdr");
  return row;
}

/** 'done' with no activity id is a real, if rarer, case: Juan marks a row done
 * by hand (he called from his phone instead, say) without routing it through
 * the capture box. That is honest, not a gap, so completedActivityId stays
 * optional rather than required. */
export async function updateSdrScheduleStatus(
  id: string,
  status: "pending" | "done" | "skipped",
  completedActivityId?: number,
): Promise<SdrScheduleItem> {
  const row = await setSdrScheduleStatus(id, status, completedActivityId);
  revalidatePath("/nutribiotic/sdr");
  return row;
}

/**
 * "Tell outbound a client needs an email with specifics" used to be a manual
 * flag here. Juan's ask, 2026-09-08: it should come from the call itself, not
 * a second thing to type. That's now touchpoint.ts's outreach_asks, filed the
 * moment the call is logged through the SAME capture box this page already
 * uses. This page's job is just to show what landed there, see
 * lib/sdr-ui.tsx's ViewInOutbound, which opens /nutribiotic/outbound?account=
 * in a new tab instead of flagging anything itself.
 */
