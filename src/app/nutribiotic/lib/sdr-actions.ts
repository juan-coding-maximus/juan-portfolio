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
  insertDraftRequest,
  insertSdrScheduleItem,
  searchOwnedAccounts,
  setSdrScheduleStatus,
  type NewSdrScheduleItem,
  type SdrScheduleItem,
} from "./dal";

export async function searchSdrAccounts(query: string) {
  const res = await searchOwnedAccounts(query);
  return res.data;
}

export async function addSdrScheduleItem(input: NewSdrScheduleItem): Promise<SdrScheduleItem> {
  const row = await insertSdrScheduleItem(input);
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

export type FlagOutboundResult = { ok: true; draftId: string } | { ok: false; error: string };

/**
 * "Tell outbound a client needs an email with specifics." Files straight into
 * the Outbound queue as a pending draft, Juan's own words as the body, exact,
 * never re-summarized (root AGENTS.md P2: no fabrication, nothing invented on
 * the way in). Outbound still requires a human "Mark sent" before anything
 * claims to have gone out, this only ever stages the ask.
 */
export async function flagNeedsEmail(accountId: string, specifics: string): Promise<FlagOutboundResult> {
  const text = specifics.trim();
  if (!text) return { ok: false, error: "Say what the email needs to cover." };
  try {
    const draft = await insertDraftRequest({ account_id: accountId, specifics: text });
    revalidatePath("/nutribiotic/outbound");
    revalidatePath("/nutribiotic/sdr");
    return { ok: true, draftId: draft.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
