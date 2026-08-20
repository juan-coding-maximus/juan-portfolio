/**
 * The automatic door onto the same exact-text contract recordManualEmail
 * (outbound-actions.ts) already gives the typed form: a Sent Outlook message
 * becomes a HubSpot Email engagement with no human typing who it was for.
 * Called every 10 minutes by bridges/nutribiotic/email_sync.py, one Graph
 * message per request.
 *
 * DEDUP FIRST, EVERYTHING ELSE AFTER. claimEmailMessage() is the only line
 * that runs unconditionally: it INSERTs the Graph message id into
 * nb_email_poll_log, and that table's unique index (migration 0038) is what
 * actually stops a message being filed twice, not this route's own logic. A
 * claim that fails (already seen) returns immediately; nothing below it runs.
 *
 * THE ACCOUNT IS NEVER GUESSED. The caller sends recipient addresses, not an
 * account id, on purpose: this route (not the Python poller) owns the only
 * matching step, via resolveAccountForEmail's exact-email-match-only rule
 * (dal.ts). A poller trusted to pick its own account_id could drift from that
 * rule over time in a way a shared server function cannot.
 *
 * Bearer-token gated (NB_SESSION_SECRET), same as api/touchpoint -- a write
 * endpoint reachable without the browser's session, the Mac is the only
 * intended caller.
 */
import {
  claimEmailMessage,
  insertActivity,
  resolveAccountForEmail,
  updateEmailPollLog,
} from "../../lib/dal";
import { autoFileEngagement } from "../../lib/touchpoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.NB_SESSION_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const messageId = (body?.message_id as string | undefined)?.trim();
  const sentAt = (body?.sent_at as string | undefined)?.trim();
  const direction = body?.direction === "inbound" ? "inbound" : "outbound";
  const toAddresses = Array.isArray(body?.to_addresses)
    ? (body.to_addresses as unknown[]).filter((a): a is string => typeof a === "string")
    : [];
  const subject = (body?.subject as string | undefined)?.trim() || null;
  const text = (body?.body as string | undefined)?.trim();

  if (!messageId || !sentAt || !text) {
    return Response.json(
      { ok: false, error: "message_id, sent_at, and body are required." },
      { status: 400 },
    );
  }

  const claim = await claimEmailMessage({
    message_id: messageId,
    sent_at: sentAt,
    direction,
    to_addresses: toAddresses,
  });
  if (!claim.claimed) {
    return Response.json({ ok: true, duplicate: true, filed: false });
  }

  const match = await resolveAccountForEmail(toAddresses);
  if (!match) {
    await updateEmailPollLog(claim.id!, { status: "skipped_no_match" });
    return Response.json({ ok: true, duplicate: false, filed: false, reason: "no_confident_match" });
  }

  const detail =
    direction === "outbound"
      ? `Emailed${subject ? ` "${subject}"` : ""}: ${text}`
      : `Received an email${subject ? ` "${subject}"` : ""}: ${text}`;

  try {
    const activity = await insertActivity({
      account_id: match.account_id,
      contact_id: match.contact_id,
      kind: direction === "outbound" ? "email_out" : "email_in",
      direction,
      detail,
      at: sentAt,
    });
    const hubspot = await autoFileEngagement(activity.id);
    await updateEmailPollLog(claim.id!, {
      status: hubspot.hubspotFiled ? "filed" : "error",
      matched_account_id: match.account_id,
      matched_contact_id: match.contact_id,
      activity_id: activity.id,
      hubspot_note_id: hubspot.hubspotNoteId,
      error: hubspot.hubspotError,
    });
    return Response.json({ ok: true, duplicate: false, filed: true, ...hubspot });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await updateEmailPollLog(claim.id!, {
      status: "error",
      matched_account_id: match.account_id,
      matched_contact_id: match.contact_id,
      error,
    });
    return Response.json({ ok: false, error }, { status: 500 });
  }
}
