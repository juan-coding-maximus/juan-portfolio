/**
 * Text-in touchpoint intake. Called by bridges/nutribiotic/cliente.py when Juan
 * dictates an interaction into the Claude CLI ("Cliente" keyword) instead of
 * typing it into the Today screen or recording it.
 *
 * This is a THIRD DOOR ONTO ONE EXTRACTOR, not a third extractor. Typed notes
 * (touchpoint-ui.tsx), recorded visits (api/visits/transcript) and dictated
 * ones (here) all land in the same recordTouchpoint(), so the parse, the
 * account matching, the fill-never-overwrite contact rule and the pending
 * calendar proposals are identical whichever door was used. A second extraction
 * prompt is exactly how a spoken visit and a typed one start disagreeing.
 *
 * Bearer-token gated (NB_SESSION_SECRET), same as the transcript route: this is
 * a write endpoint reachable without the browser's session context, and the Mac
 * is the only intended caller.
 *
 * Nothing here reaches HubSpot. This writes into the OS only; carrying the
 * activity across the HubSpot boundary is hubspot_notes.py's single hop, still
 * dry-by-default, still a human's --write.
 */
import { recordTouchpoint } from "../../lib/touchpoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.NB_SESSION_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const text = (body?.text as string | undefined)?.trim();
  const accountIdHint = (body?.account_id as string | undefined) || null;
  const occurredAt = (body?.occurred_at as string | undefined) || null;
  if (!text) {
    return Response.json({ ok: false, error: "text is required." }, { status: 400 });
  }

  const result = await recordTouchpoint(text, accountIdHint, occurredAt);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 422 });
  }
  return Response.json({ ok: true, result });
}
