/**
 * File one receipt photo + its confirmed fields. The fields arrive already
 * confirmed by the rep in the UI (the classify route only ever suggests);
 * this route does not re-derive them.
 */
import { fileReceipt } from "../../../lib/expenses";
import { hasValidSession } from "../../../lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await hasValidSession())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Expected multipart/form-data." }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return Response.json({ ok: false, error: "No photo." }, { status: 400 });
  }
  const date = form.get("date") as string | null;
  const merchant = ((form.get("merchant") as string | null) ?? "").trim();
  const purpose = ((form.get("purpose") as string | null) ?? "").trim();
  const amount = ((form.get("amount") as string | null) ?? "").trim();

  if (!date) {
    return Response.json({ ok: false, error: "date is required." }, { status: 400 });
  }
  if (amount && Number.isNaN(Number(amount))) {
    return Response.json({ ok: false, error: "amount must be a number." }, { status: 400 });
  }

  try {
    const bytes = await photo.arrayBuffer();
    const result = await fileReceipt({
      date, merchant, purpose, amount,
      photo: { bytes, mimeType: photo.type || "image/jpeg", filename: photo.name || "receipt.jpg" },
    });
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Filing failed." }, { status: 500 });
  }
}
