/**
 * The Visit screen's three queues, as JSON, fetched after the page is usable.
 *
 * WHY THEY LEFT THE PAGE RENDER (2026-08-27, and this is a reliability fix,
 * not a speed one). These reads used to happen inside the /visit render. First
 * they blocked it outright, three Supabase round trips before the capture box
 * existed. Then they moved behind a Suspense boundary, which unblocked the box
 * but kept the HTTP response OPEN until they resolved, because a streamed
 * document is not finished until its last boundary is.
 *
 * An open stream is a liability on a phone. On 2026-08-27 09:26 the nav's
 * default link prefetch put four full dynamic renders on the wire 0.8s after
 * the ClientOS tile opened; the connection saturated, the still-open /visit
 * stream stalled, and iOS abandoned the navigation with "This page couldn't
 * load" while every request in the log read 200.
 *
 * So now the document closes as soon as the capture box is written, and the
 * queues arrive on their own request afterwards. A slow or failed queue read
 * can no longer hold a response open, and cannot take the page down with it.
 * Juan, 2026-08-27: "reliability is priority number one, speed is priority
 * number two." This happens to serve both.
 *
 * Read-only. Same PIN/device gate as every other screen, via the DAL.
 */
import {
  getAccountNames,
  isConfigured,
  listCalendarProposals,
  listPendingAccountMatches,
  listUnfiledActivities,
} from "../../lib/dal";
import type { ParsedTouchpoint } from "../../lib/touchpoint";
import { isNextControlFlowError } from "../../lib/redirect-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return Response.json(
      { ok: true, proposals: [], unfiled: [], pending: [], accountNames: {} },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const [proposals, unfiled, pending] = await Promise.all([
      listCalendarProposals(),
      listUnfiledActivities(),
      listPendingAccountMatches(),
    ]);

    // Only for a spoken visit that parked as low-confidence, which is the
    // uncommon case, so this stays off the common path.
    const lowConfidenceIds = pending.data
      .map((tp) => tp.parsed as ParsedTouchpoint | null)
      .filter((p): p is ParsedTouchpoint => p != null && p.account_confidence === "low" && !!p.account_id)
      .map((p) => p.account_id as string);
    const accountNames = await getAccountNames([...new Set(lowConfidenceIds)]).catch(
      () => ({}) as Record<string, string>,
    );

    return Response.json(
      {
        ok: true,
        proposals: proposals.data,
        unfiled: unfiled.data,
        pending: pending.data,
        accountNames,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // A lapsed session must still reach the gate.
    if (isNextControlFlowError(e)) throw e;
    // The caller renders a small note and keeps the capture box working. A
    // queue that cannot be read is never an error the whole screen carries.
    return Response.json({ ok: false }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
