"use server";

import { revalidatePath } from "next/cache";
import { setDraftStatus } from "./dal";

/**
 * The human gate on a drafted email. 'sent' does NOT send anything — it only
 * records that Juan clicked "Open in Outlook" and, on his own word, sent it
 * from his real mailbox. 'dismissed' just closes the row out.
 */
export async function decideDraft(id: string, decision: "sent" | "dismissed") {
  await setDraftStatus(id, decision);
  revalidatePath("/nutribiotic/outbound");
}
