/**
 * Visit. Door 3 onto the shared extractor: type it or record it, right here,
 * with the same end-to-end filing clientos does (OS row, HubSpot Note/Call/
 * Meeting, pending calendar proposal), Juan's own click standing in for the
 * dry-run review the CLI skill has Claude do.
 *
 * See lib/touchpoint.ts for the one extractor all three doors share, and
 * lib/hubspot-engagement.ts for the HubSpot half, ported from
 * bridges/nutribiotic/hubspot_notes.py.
 */

import { Suspense } from "react";
import {
  getAccountNames,
  isConfigured,
  listCalendarProposals,
  listPendingAccountMatches,
  listUnfiledActivities,
} from "../lib/dal";
import { EngagementQueue } from "../lib/engagement-ui";
import { AccountMatchResolver } from "../lib/new-account-ui";
import { CalendarProposalRow, TouchpointCapture } from "../lib/touchpoint-ui";
import type { ParsedTouchpoint } from "../lib/touchpoint";
import { LAUNCHERS } from "../lib/launchers";
import { Empty, PageHead } from "../lib/ui";
import { WarmRoutes } from "../lib/WarmRoutes";

export const dynamic = "force-dynamic";
/* appleWebApp.title labels the Home Screen icon when this exact screen is the
   one added, which is the point of adding it: a tile that lands on capture, not
   a "NutriBiotic" one that lands on the map.
   ClientOS, not Visit: it is the name Juan already says out loud to file an
   interaction (the `clientos` keyword), and the tile and the word he uses for
   the same act should not be two different names. The tab keeps saying Visit,
   which is what the nav calls it. Icon is apple-icon.png in this folder, the
   leaves-only brand mark on ink. */
/* The manifest is what decides WHERE the tile opens, and it has to be this
   screen's own: iOS 16.4+ launches the linked manifest's start_url, so while the
   whole OS shared one, a ClientOS tile with a ClientOS name and a ClientOS icon
   still opened the map. See ../lib/launchers.ts. */
export const metadata = {
  title: "Visit · NutriBiotic OS",
  appleWebApp: { title: "ClientOS" },
  manifest: LAUNCHERS.CLIENTOS.href,
};

/**
 * NOT ASYNC, AND THAT IS THE WHOLE POINT (Juan, 2026-08-26: "it must be super
 * fast and only load that really quick").
 *
 * This function awaits nothing, so the heading and the capture box are in the
 * first flush of the stream. Everything else on this screen is a QUEUE: work
 * that arrived earlier and is waiting on him. None of it is needed to type
 * what just happened, and all of it used to block the box that types it, three
 * Supabase reads deep, sometimes four.
 *
 * The queues render below the capture box, so streaming them in later moves
 * nothing above it. That is why the Suspense fallback is `null` rather than a
 * skeleton: a placeholder here would reserve space for lists that are usually
 * empty and push the box up when they resolve.
 */
export default function VisitPage() {
  return (
    <>
      <PageHead title="Visit" />

      {!isConfigured() ? (
        <Empty>No data source configured. Nothing is being shown, and nothing is being guessed.</Empty>
      ) : (
        <div className="flex flex-col gap-8">
          <TouchpointCapture />

          <Suspense fallback={null}>
            <VisitQueues />
          </Suspense>

          {/* Everything else this OS can do, warmed 15 seconds after the box is
              usable. See WarmRoutes. */}
          <WarmRoutes />
        </div>
      )}
    </>
  );
}

/**
 * The three queues, off the critical path.
 *
 * Read together rather than in sequence, and the account-name lookup only
 * happens when a spoken visit actually parked as low-confidence, which is the
 * uncommon case.
 */
async function VisitQueues() {
  /**
   * NEVER THROWS, AND THAT IS LOAD-BEARING.
   *
   * These reads used to happen BEFORE any HTML was flushed, so a Supabase
   * failure produced a clean error page. Now the shell flushes first, which
   * means an uncaught throw in here aborts a stream that is already in the
   * browser: the reader gets a truncated document and "the page couldn't
   * load", which is a far worse failure than the one it replaced, and it
   * would take the capture box down with it.
   *
   * So a queue failure degrades to a queue-shaped message and nothing else.
   * The box above it keeps working, because filing what just happened does
   * not depend on any of this. There is a segment-level error.tsx as a second
   * net, but nothing on this screen should ever need it.
   */
  let proposals, unfiled, pending;
  try {
    [proposals, unfiled, pending] = await Promise.all([
      listCalendarProposals(),
      listUnfiledActivities(),
      listPendingAccountMatches(),
    ]);
  } catch {
    return (
      <div className="mx-auto w-full max-w-[600px] rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[13px] text-[#8A6D2F]">
        Couldn&rsquo;t load the follow-up queues just now. Logging a visit still works.
      </div>
    );
  }

  // A recorded (spoken) visit that parks as needs_account resolves after
  // transcription, on nobody's screen, so it needs its own name lookup
  // rather than the one recordTouchpoint() already did for a same-page typed
  // note (see AccountMatchResolver in touchpoint-ui.tsx).
  const lowConfidenceIds = pending.data
    .map((tp) => (tp.parsed as ParsedTouchpoint | null))
    .filter((p): p is ParsedTouchpoint => p != null && p.account_confidence === "low" && !!p.account_id)
    .map((p) => p.account_id as string);
  const accountNames = await getAccountNames([...new Set(lowConfidenceIds)]).catch(() => ({}) as Record<string, string>);

  return (
    <>
          {pending.data.length > 0 && (
            <section className="mx-auto w-full max-w-[600px]">
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
                Needs a match
              </h2>
              <div className="flex flex-col gap-4">
                {pending.data.map((tp) => {
                  const parsed = tp.parsed as ParsedTouchpoint | null;
                  const matchAccountId =
                    parsed?.account_confidence === "low" && parsed.account_id ? parsed.account_id : null;
                  return (
                    <div key={tp.id} className="rounded-xl border border-[#E2DFD5] bg-white p-4">
                      <p className="line-clamp-3 text-[13px] leading-relaxed text-[#3D4A44]">{tp.raw_text}</p>
                      <AccountMatchResolver
                        touchpointId={tp.id}
                        nameGuess={parsed?.business_name_guess ?? null}
                        matchAccountId={matchAccountId}
                        matchAccountName={matchAccountId ? (accountNames[matchAccountId] ?? null) : null}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="mx-auto w-full max-w-[600px]">
            <EngagementQueue activities={unfiled.data} />
          </div>

          {proposals.data.length > 0 && (
            <section className="mx-auto w-full max-w-[600px]">
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
                Follow-ups to confirm
              </h2>
              <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
                {proposals.data.map((p) => (
                  <CalendarProposalRow key={p.id} proposal={p} />
                ))}
              </ul>
            </section>
          )}
    </>
  );
}
