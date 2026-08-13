"use server";

import { recordTouchpoint, type RecordTouchpointResult } from "./touchpoint";

/**
 * Files a WhatsApp send into the OS the moment Juan confirms he actually sent
 * it (see OutreachComposer: the button only appears after "Open in WhatsApp"
 * was clicked). Goes through the exact same first-person extractor every
 * other capture door uses (clientos, whatsappos, the typed Today screen),
 * framed the same way whatsappos's skill frames a read WhatsApp thread: a
 * report in Juan's own voice, quoting the sent text verbatim rather than
 * summarizing it.
 *
 * OS-ONLY, same boundary recordTouchpoint() has always had: nothing here
 * reaches HubSpot. Filing the HubSpot Note for an outreach send still goes
 * through bridges/nutribiotic/hubspot_notes.py's dry-run-then-write gate,
 * same as every other activity kind, rather than adding a second, unproven
 * HubSpot writer straight from the public app. See file_outreach.py.
 */
export async function recordOutreachSent(
  accountId: string,
  recipientLabel: string,
  messageText: string,
): Promise<RecordTouchpointResult> {
  const text = `I sent a WhatsApp message to ${recipientLabel}: "${messageText.trim()}"`;
  return recordTouchpoint(text, accountId, null);
}
