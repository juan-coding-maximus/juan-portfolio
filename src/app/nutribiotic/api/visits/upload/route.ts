/**
 * Receives a recorded visit's audio from the browser and files it for the
 * Mac-side transcriber to pick up. Mirrors the Hunter dashboard's meetings
 * upload (Supabase storage + a status row a poller drains), the difference
 * being this app never ships a Supabase key to the browser (see dal.ts), so
 * the upload has to go through a route handler rather than a client-side
 * Supabase call.
 *
 * Nothing is parsed or written to the CRM here. This only creates the
 * 'uploaded' tracking row; bridges/nutribiotic/visits.py transcribes it and
 * POSTs the text to /api/visits/transcript, which runs the real extraction.
 */
import { insertVisitRecording, uploadVisitAudio } from "../../../lib/dal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Expected multipart/form-data." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ ok: false, error: "No audio file." }, { status: 400 });
  }
  if (audio.size < 1000) {
    return Response.json({ ok: false, error: "Recording was empty." }, { status: 400 });
  }

  const accountIdHint = (form.get("account_id_hint") as string | null) || null;
  const startedAt = (form.get("started_at") as string | null) || null;
  const endedAt = (form.get("ended_at") as string | null) || null;

  const ct = (audio.type || "audio/webm").split(";")[0];
  const ext = ct.includes("mp4") ? "m4a" : ct.includes("webm") ? "webm" : ct.includes("mpeg") ? "mp3" : ct.includes("wav") ? "wav" : ct.includes("ogg") ? "ogg" : "m4a";

  try {
    const bytes = await audio.arrayBuffer();
    const path = await uploadVisitAudio(bytes, ct, ext);
    const row = await insertVisitRecording({
      account_id_hint: accountIdHint,
      audio_path: path,
      started_at: startedAt,
      ended_at: endedAt,
    });
    return Response.json({ ok: true, id: row.id });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 },
    );
  }
}
