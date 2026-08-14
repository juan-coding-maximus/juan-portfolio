/**
 * Clock in/out from the browser. Same filing path as the CLI's `hours`
 * subcommand (lib/expenses.ts mirrors expense_log.py's layout and math
 * exactly); see that file's header for what does and doesn't carry over.
 */
import { fileHours } from "../../../lib/expenses";
import { hasValidSession } from "../../../lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!(await hasValidSession())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const date = body?.date as string | undefined;
  const clockIn = body?.clock_in as string | undefined;
  const clockOut = body?.clock_out as string | undefined;
  const breakMin = Number(body?.break_min ?? 0);
  const notes = (body?.notes as string | undefined)?.trim() ?? "";

  if (!date || !clockIn || !clockOut) {
    return Response.json({ ok: false, error: "date, clock_in and clock_out are required." }, { status: 400 });
  }
  if (!Number.isFinite(breakMin) || breakMin < 0) {
    return Response.json({ ok: false, error: "break_min must be a non-negative number." }, { status: 400 });
  }

  try {
    const result = await fileHours({ date, clockIn, clockOut, breakMin, notes });
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Filing failed." }, { status: 500 });
  }
}
