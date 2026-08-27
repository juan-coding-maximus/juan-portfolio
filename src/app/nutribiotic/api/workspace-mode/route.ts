/**
 * Whether this workspace is showing sample data.
 *
 * One tiny read, moved off the layout's critical path for the same reason the
 * route state was (see api/route-state/route.ts): anything the layout awaits,
 * or streams, is paid for by /visit, which does not use it, and an open stream
 * is what iOS turns into "This page couldn't load" on a saturated connection.
 *
 * FAILS TOWARD SILENCE, NEVER TOWARD A WRONG LABEL. If the read fails the
 * banner does not render, which is what already happened when the whole page
 * failed. What must never happen is real data labelled sample, or sample data
 * labelled real: this answers from the source or not at all, and nothing about
 * the mode is inferred from anything else.
 */
import { isConfigured, workspaceMode } from "../../lib/dal";
import { isNextControlFlowError } from "../../lib/redirect-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return Response.json({ synthetic: false }, { headers: { "cache-control": "no-store" } });
  }
  try {
    return Response.json(
      { synthetic: (await workspaceMode()) === "synthetic" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // A lapsed session must still reach the gate.
    if (isNextControlFlowError(e)) throw e;
    return Response.json({ synthetic: false }, { headers: { "cache-control": "no-store" } });
  }
}
