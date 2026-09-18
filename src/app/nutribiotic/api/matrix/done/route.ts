/** Check a task off (or reopen it). Checked, it leaves its quadrant for the
 *  success list at the foot of the board. */
import { setMatrixTaskDone } from "../../../lib/dal";
import { hasAccess } from "../../../lib/devices";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const done = body?.done !== false;
  if (!id) {
    return Response.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  try {
    const task = await setMatrixTaskDone(id, done);
    return Response.json({ ok: true, task });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Save failed." }, { status: 500 });
  }
}
