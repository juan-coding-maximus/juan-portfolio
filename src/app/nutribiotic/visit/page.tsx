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
import { CalendarProposalRow, TouchpointCapture } from "../lib/touchpoint-ui";
import { LAUNCHERS } from "../lib/launchers";
import { Empty, PageHead } from "../lib/ui";

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

export default async function VisitPage() {
  const [proposals, unfiled] = await Promise.all([
    isConfigured() ? listCalendarProposals() : Promise.resolve({ data: [] }),
    isConfigured() ? listUnfiledActivities() : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <PageHead title="Visit" />

      {!isConfigured() ? (
        <Empty>No data source configured. Nothing is being shown, and nothing is being guessed.</Empty>
      ) : (
        <div className="flex flex-col gap-8">
          <TouchpointCapture />

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
        </div>
      )}
    </>
  );
}
