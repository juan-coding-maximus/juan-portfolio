/**
 * Called by bridges/nutribiotic/visits.py once it has transcribed a recorded
 * visit locally (whisper.cpp, via the same bridges/lib/stt.py the JobHunt
 * meetings recorder uses). This is deliberately the ONLY place a transcript
 * turns into CRM data, and it does so by calling the exact same
 * recordTouchpoint() a typed note goes through, not a second extraction
 * prompt, so a spoken visit and a typed one are parsed identically.
 *
 * Bearer-token gated (NB_SESSION_SECRET, already minted for this app) since
 * this is a write endpoint reachable without the browser's session context,
 * the Mac processor is the only intended caller.
 */
import { patchVisitRecording, getVisitRecording } from "../../../lib/dal";
import { recordTouchpoint } from "../../../lib/touchpoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.NB_SESSION_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const recordingId = body?.recording_id as string | undefined;
  const transcript = (body?.transcript as string | undefined)?.trim();
  if (!recordingId || !transcript) {
    return Response.json({ ok: false, error: "recording_id and transcript are required." }, { status: 400 });
  }

  const recording = await getVisitRecording(recordingId);
  if (!recording) {
    return Response.json({ ok: false, error: "No such recording." }, { status: 404 });
  }

  const result = await recordTouchpoint(transcript, recording.account_id_hint);

  if (!result.ok) {
    await patchVisitRecording(recordingId, { status: "error", transcript, error: result.error });
    return Response.json({ ok: false, error: result.error });
  }

  await patchVisitRecording(recordingId, {
    status: "processed",
    transcript,
    touchpoint_id: result.touchpoint_id,
  });
  return Response.json({ ok: true, result });
}
