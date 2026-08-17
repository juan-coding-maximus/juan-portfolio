/**
 * The current pay period's label + a direct link to its spreadsheet, for the
 * "review it" button on the expenses page. Creating the tree here (rather
 * than just guessing the sheet name) means the link is always real: the
 * first person to open the page in a new period is also the one who
 * provisions that period's folder/sheet, same as the CLI's `setup`.
 */
import { periodSummary } from "../../../lib/expenses";
import { hasAccess } from "../../../lib/devices";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD
  try {
    const summary = await periodSummary(today);
    return Response.json({ ok: true, today, ...summary });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Could not reach Drive." }, { status: 500 });
  }
}
