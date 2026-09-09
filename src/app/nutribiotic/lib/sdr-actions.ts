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

/**
 * "Tell outbound a client needs an email with specifics" used to be a manual
 * flag here. Juan's ask, 2026-09-08: it should come from the call itself, not
 * a second thing to type. That's now touchpoint.ts's outreach_asks, filed the
 * moment the call is logged through the SAME capture box this page already
 * uses. This page's job is just to show what landed there, see
 * lib/sdr-ui.tsx's ViewInOutbound, which opens /nutribiotic/outbound?account=
 * in a new tab instead of flagging anything itself.
 */
