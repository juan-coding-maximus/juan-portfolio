/**
 * Attaches a photo to an already-filed touchpoint. One row per capture
 * (nb_touchpoints) covers every kind the extractor can pick, per 0060, so
 * this route is the single door for a photo on a visit, a call, a meeting,
 * or a field_note. Mirrors ../upload/route.ts's auth and multipart handling;
 * the difference is this uploads to Drive (lib/gdrive.ts, same pattern as
 * Expenses receipts) rather than Supabase Storage, deliberately, per the
 * 2026-09-02 egress suspension.
 */
import { attachTouchpointPhoto } from "../../../lib/dal";
import { hasAccess } from "../../../lib/devices";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Expected multipart/form-data." }, { status: 400 });
  }

  const touchpointId = form.get("touchpoint_id") as string | null;
  if (!touchpointId) {
    return Response.json({ ok: false, error: "touchpoint_id is required." }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return Response.json({ ok: false, error: "No photo." }, { status: 400 });
  }

  try {
    const bytes = await photo.arrayBuffer();
    const result = await attachTouchpointPhoto(touchpointId, {
      bytes,
      mimeType: photo.type || "image/jpeg",
      filename: photo.name || "photo.jpg",
    });
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Attach failed." },
      { status: 500 },
    );
  }
}
