/**
 * Add a task to the Matrix board, from the "+" in whichever quadrant Juan
 * tapped, or from a visit log (clientos/whatsappos) surfacing a to-do.
 */
import { addMatrixTask, type MatrixQuadrant } from "../../lib/dal";
import { hasAccess } from "../../lib/devices";

export const runtime = "nodejs";
export const maxDuration = 30;

const QUADRANTS = new Set<MatrixQuadrant>(["I", "II", "III", "IV"]);

export async function POST(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const quadrant = body?.quadrant as string | undefined;
  const text = (body?.text as string | undefined)?.trim();
  const description = (body?.description as string | undefined)?.trim() || null;
  const effort = typeof body?.effort === "number" ? body.effort : null;
  const yieldScore = typeof body?.yield_score === "number" ? body.yield_score : null;
  const source = (body?.source as string | undefined) || "manual";

  if (!quadrant || !QUADRANTS.has(quadrant as MatrixQuadrant)) {
    return Response.json({ ok: false, error: "quadrant must be I, II, III, or IV." }, { status: 400 });
  }
  if (!text) {
    return Response.json({ ok: false, error: "text is required." }, { status: 400 });
  }

  try {
    const task = await addMatrixTask(quadrant as MatrixQuadrant, text, {
      description,
      effort,
      yield_score: yieldScore,
      source,
    });
    return Response.json({ ok: true, task });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Save failed." }, { status: 500 });
  }
}
