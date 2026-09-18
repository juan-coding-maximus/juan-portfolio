/** Place or move a task's dot on the effort/yield board. */
import { setMatrixTaskPosition } from "../../../lib/dal";
import { hasAccess } from "../../../lib/devices";

export const runtime = "nodejs";
export const maxDuration = 30;

function clamp01(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

export async function POST(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const effort = clamp01(body?.effort);
  const yieldScore = clamp01(body?.yield_score);
  if (!id || effort === null || yieldScore === null) {
    return Response.json({ ok: false, error: "id, effort and yield_score (0-1) are required." }, { status: 400 });
  }

  try {
    const task = await setMatrixTaskPosition(id, effort, yieldScore);
    return Response.json({ ok: true, task });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Save failed." }, { status: 500 });
  }
}
