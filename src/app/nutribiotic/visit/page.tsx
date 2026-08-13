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

import { isConfigured, listCalendarProposals, listUnfiledActivities } from "../lib/dal";
import { EngagementQueue } from "../lib/engagement-ui";
import { CalendarProposalRow, RecordVisit, TouchpointCapture } from "../lib/touchpoint-ui";
import { Empty, PageHead } from "../lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit · NutriBiotic OS" };

export default async function VisitPage() {
  const [proposals, unfiled] = await Promise.all([
    isConfigured() ? listCalendarProposals() : Promise.resolve({ data: [] }),
    isConfigured() ? listUnfiledActivities() : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <PageHead
        title="Visit"
        sub="Log what just happened, typed or recorded. It becomes an activity log entry and contact detail right away; any follow-up it hears waits below for your approval before it touches your calendar or HubSpot."
      />

      {!isConfigured() ? (
        <Empty>No data source configured. Nothing is being shown, and nothing is being guessed.</Empty>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="max-w-[640px]">
            <TouchpointCapture />
            <RecordVisit />
          </section>

          <div className="max-w-[640px]">
            <EngagementQueue activities={unfiled.data} />
          </div>

          {proposals.data.length > 0 && (
            <section className="max-w-[640px]">
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
        </div>
      )}
    </>
  );
}
