"use server";

import { revalidatePath } from "next/cache";
import { runEngagement, Blocked, type EngagementResult } from "./hubspot-engagement";

export type EngagementOutcome = { ok: true; result: EngagementResult } | { ok: false; error: string };

function toOutcome(e: unknown): EngagementOutcome {
  if (e instanceof Blocked) return { ok: false, error: e.message };
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/** Read-only: may still search HubSpot for a duplicate or a phone match, but
 * never POSTs the engagement itself. Safe to call the moment a row renders. */
export async function previewEngagement(activityId: number): Promise<EngagementOutcome> {
  try {
    return { ok: true, result: await runEngagement(activityId, { write: false }) };
  } catch (e) {
    return toOutcome(e);
  }
}

/** The human gate: only reached by Juan clicking File to HubSpot on a preview
 * he has already seen rendered. */
export async function fileEngagement(activityId: number): Promise<EngagementOutcome> {
  try {
    const result = await runEngagement(activityId, { write: true });
    revalidatePath("/nutribiotic/visit");
    return { ok: true, result };
  } catch (e) {
    return toOutcome(e);
  }
}
