"use server";

import { revalidatePath } from "next/cache";
import { setCalendarProposalStatus } from "./dal";

/**
 * The human gate on calendar writes. Flipping a proposal to 'approved' does
 * NOT touch Google Calendar, it only marks it ready for
 * bridges/nutribiotic/calendar_sync.py to pick up and create (mirroring
 * gcal_client.py's own confirm=True gate). 'dismissed' just closes it out.
 */
export async function decideCalendarProposal(id: string, decision: "approved" | "dismissed") {
  await setCalendarProposalStatus(id, decision);
  revalidatePath("/nutribiotic");
}
