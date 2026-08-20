"use server";

import { revalidatePath } from "next/cache";
import { getAccountNames, insertActivity, setDraftStatus } from "./dal";
import { autoFileEngagement } from "./touchpoint";

export type DraftSentResult = {
  filed: boolean;
  accountName: string | null;
  hubspotFiled: boolean;
  hubspotNoteId: string | null;
  hubspotError: string | null;
} | null;

/**
 * The human gate on a drafted send. 'sent' does NOT send anything — it only
 * records that Juan opened the compose window (Outlook/WhatsApp/Messages)
 * and, on his own word, sent it himself; the OS cannot verify a send on any
 * channel. 'dismissed' just closes the row out, no filing.
 *
 * "Mark sent" on this queue means one thing happened: this writes the exact
 * body Juan drafted (never a re-summary of it) as an nb_activities row and
 * files it to HubSpot the same way a Visit-tab touchpoint auto-files
 * (autoFileEngagement, see touchpoint.ts) — no LLM extraction step, because
 * the message is already exact text, not a spoken report to parse. A filing
 * failure never unwinds the "sent" mark; the activity just stays unfiled and
 * drops into the Visit tab's retry queue, same failure contract every other
 * capture door has.
 *
 * A draft with no account_id (not yet linked to one) has nowhere to file to,
 * so `filed` comes back false with no HubSpot attempt made — surfaced to
 * Juan rather than silently skipped.
 */
export async function decideDraft(
  id: string,
  decision: "sent" | "dismissed",
  context?: { accountId: string | null; channel: string; subject: string | null; body: string },
): Promise<DraftSentResult> {
  await setDraftStatus(id, decision);
  revalidatePath("/nutribiotic/outbound");

  if (decision !== "sent" || !context) return null;
  if (!context.accountId) {
    return { filed: false, accountName: null, hubspotFiled: false, hubspotNoteId: null, hubspotError: null };
  }

  const detail =
    context.channel === "email"
      ? `Emailed${context.subject ? ` "${context.subject}"` : ""}: ${context.body}`
      : context.body;

  const activity = await insertActivity({
    account_id: context.accountId,
    kind: context.channel === "email" ? "email_out" : "text",
    direction: "outbound",
    detail,
  });
  const hubspot = await autoFileEngagement(activity.id);
  const names = await getAccountNames([context.accountId]);

  return { filed: true, accountName: names[context.accountId] ?? null, ...hubspot };
}
