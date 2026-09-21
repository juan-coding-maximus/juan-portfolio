/** Edit a task already on the board: its text, details, or quadrant. Juan
 *  can open this on any line item at any point, not just when adding it. */
import { updateMatrixTask, type MatrixQuadrant } from "../../../lib/dal";
import { hasAccess } from "../../../lib/devices";

export const runtime = "nodejs";
export const maxDuration = 30;

const QUADRANTS = new Set<MatrixQuadrant>(["I", "II", "III", "IV"]);

export async function POST(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) {
    return Response.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const fields: { text?: string; description?: string | null; quadrant?: MatrixQuadrant } = {};

  if (body?.text !== undefined) {
    const text = (body.text as string).trim();
    if (!text) {
      return Response.json({ ok: false, error: "text cannot be empty." }, { status: 400 });
    }
    fields.text = text;
  }
  if (body?.description !== undefined) {
    fields.description = (body.description as string | null)?.toString().trim() || null;
  }
  if (body?.quadrant !== undefined) {
    if (!QUADRANTS.has(body.quadrant as MatrixQuadrant)) {
      return Response.json({ ok: false, error: "quadrant must be I, II, III, or IV." }, { status: 400 });
    }
    fields.quadrant = body.quadrant as MatrixQuadrant;
  }

  if (Object.keys(fields).length === 0) {
    return Response.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    const task = await updateMatrixTask(id, fields);
    return Response.json({ ok: true, task });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Save failed." }, { status: 500 });
  }
}
