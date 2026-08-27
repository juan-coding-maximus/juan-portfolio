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

import { TouchpointCapture } from "../lib/touchpoint-ui";
import { LAUNCHERS } from "../lib/launchers";
import { isConfigured } from "../lib/dal";
import { Empty, PageHead } from "../lib/ui";
import { VisitQueues } from "../lib/visit-queues-ui";
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
 * READS NOTHING. THE RESPONSE CLOSES IMMEDIATELY.
 *
 * Juan, 2026-08-27: "reliability is priority number one, speed is priority
 * number two." This screen is the one he opens standing in a doorway, and it
 * has now failed on him in two different ways, both of which came from this
 * function doing work it did not need to do.
 *
 * First it awaited three Supabase reads before the capture box existed, which
 * was merely slow. Then those reads moved behind a Suspense boundary, which
 * unblocked the box but kept the HTTP response OPEN until they resolved, and
 * an open stream turned out to be the more dangerous of the two: on 2026-08-27
 * at 09:26 the nav's default link prefetch put four full dynamic renders on
 * the wire 0.8s after the tile opened, the phone saturated, the still-open
 * /visit stream stalled, and iOS abandoned the navigation with "This page
 * couldn't load" while every request in the log read 200.
 *
 * So this function now awaits nothing, streams nothing, and has no Suspense
 * boundary. The document is complete the moment it is written: a heading, a
 * capture box, and two client components that go and get their own data
 * afterwards. There is no server work left on this screen that can hang,
 * fail, or hold a connection open, which means there is nothing left here for
 * a bad connection to break.
 *
 * The queues fetch themselves (lib/visit-queues-ui.tsx). The rest of the OS
 * warms 15 seconds later (lib/WarmRoutes.tsx). Neither can touch the box.
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
          <VisitQueues />
          <WarmRoutes />
        </div>
      )}
    </>
  );
}
