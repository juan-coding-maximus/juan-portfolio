/**
 * Route. Manual-first, on purpose.
 *
 * The biggest risk in this whole OS is not a bad route, it is Juan distrusting
 * the route tab and going back to a notes app. If that happens the activity log
 * starves and every score downstream dies with it.
 *
 * So the route builder is a tool he drives, not an oracle that tells him where to
 * go. He orders the stops; the system shows drive times, ETAs, and business-hours
 * violations. Auto-sequencing is a "suggest order" button he can accept or ignore,
 * and acceptance rate is logged to route_plan_revisions.actor. If he accepts under
 * about half the time after a month, the algorithm is wrong and there will be data
 * to say so rather than an argument.
 *
 * NOT YET BUILT: the Google Routes integration (phase 7) and the drag interaction.
 * This screen states that plainly rather than rendering a plausible empty shell
 * that implies a working feature.
 */

import { PageHead, Card, Ico } from "../lib/ui";

export const dynamic = "force-dynamic";

export default function RoutePage() {
  return (
    <>
      <PageHead
        title="Route"
        sub="Four field days and one work-from-home day. Six to ten stops a day."
      />

      <Card>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-[#8A928C]">
            <Ico name="route" />
          </div>
          <div className="max-w-[72ch]">
            <div className="text-[14.5px] font-semibold">Not built yet</div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5B6560]">
              The route planner is phase 7. The data model behind it is in place: weekly plans,
              days, stops with pinned positions and business-hours windows, and an append-only
              revision log. What is missing is the Google Routes integration for traffic-aware
              ETAs and the drag interaction for ordering stops.
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#5B6560]">
              When it ships it will be manual-first: you order the stops, the system shows drive
              time, ETAs, and any stop you have scheduled against a closed door. A suggest-order
              button will offer a sequence you can take or leave, and how often you take it gets
              logged, because that is the honest way to find out whether the algorithm is worth
              trusting.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[#8A928C]">
              One rule is already fixed in the design: priority sorts before proximity. A high-value
              account is never pushed behind three convenient ones because the drive was shorter.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
