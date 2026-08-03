/**
 * Plan. Home screen, replacing Today (2026-08-02). The SoCal month, sized to
 * the Santa Cruz benchmark day, with the daily capture and work queues that
 * used to live on Today folded in above it.
 *
 * This is NOT the phase-7 route planner (see ../route): no Supabase, no drag
 * ordering, no ETA engine. It is the static monthly plan Juan approved on
 * 2026-07-28, shipped so the field days are readable and tappable from a phone.
 * Source of truth stays in bridges/nutribiotic; data.ts is generated, disposable.
 *
 * Every address is one big Apple Maps tap target, per the standing brief format:
 * he reads a day as a mind map and taps to drive to the next stop.
 */

import {
  getCurrentRoutePlan,
  isConfigured,
  listCadenceDue,
  listStaleDeals,
  listCalendarProposals,
} from "../lib/dal";
import { AccountLink } from "../lib/modal";
import { CalendarProposalRow, RecordVisit, TouchpointCapture } from "../lib/touchpoint-ui";
import { Card, Confidence, Empty, Ico, PageHead, TierChip, daysAgo } from "../lib/ui";
import { MONTH_PLAN } from "./data";
import { WeekPlan } from "./week";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan · NutriBiotic OS" };

function Flag({ text }: { text: string }) {
  if (!text) return null;
  const closed = text.includes("CALL FIRST");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] ${
        closed ? "bg-[#F5E7DE] text-[#9C4A1C]" : "bg-[#E4EDE6] text-[#2C6A46]"
      }`}
    >
      {closed && <Ico name="alert" size={11} />}
      {closed ? "Call first" : "Warm, ordered 2026"}
    </span>
  );
}

export default async function PlanPage() {
  const [cadence, stale, proposals, week] = await Promise.all([
    listCadenceDue(12),
    listStaleDeals(8),
    listCalendarProposals(),
    getCurrentRoutePlan(),
  ]);

  return (
    <>
      <PageHead
        title="Plan"
        sub="The committed week first, read live from the route tables. The approved month sits under it as the standing shape of the territory."
      />

      {/* The dated week. Live from nb_route_plans; see week.tsx for why it is
          not a generated array like MONTH_PLAN below. */}
      {week ? (
        <WeekPlan plan={week} />
      ) : (
        <section className="mb-9">
          <Empty>
            {!isConfigured()
              ? "No data source configured, so no week can be shown."
              : "No route plan in nb_route_plans yet. Build one with bridges/nutribiotic/plan_week.py."}
          </Empty>
        </section>
      )}

      <h2 className="mb-3 font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
        The month behind it
      </h2>
      <p className="mb-4 max-w-[76ch] text-[12.5px] leading-relaxed text-[#5B6560]">
        The 62 active SoCal accounts in 8 field days plus one flex, approved 28 July. Benchmark: the
        ten-stop Santa Cruz day. Clusters two hours out are sleep-aways.
      </p>

      <div className="flex flex-col gap-5">
        {MONTH_PLAN.map((d) => (
          <Card key={d.id} className="p-0 overflow-hidden">
            <div className="border-b border-[#E2DFD5] bg-[#FBFAF6] px-5 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="font-[family-name:var(--font-fraunces)] text-[16.5px] font-semibold tracking-tight">
                  {d.id} · {d.route}
                </div>
                <div className="text-[12px] text-[#8A928C]">{d.stops.length} stops</div>
              </div>
              {d.note && <div className="mt-0.5 text-[12.5px] text-[#5B6560]">{d.note}</div>}
            </div>

            <ul className="divide-y divide-[#EEECE3]">
              {d.stops.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-[#8A928C]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[14px] font-medium leading-snug">{s.name}</span>
                      <Flag text={s.flags} />
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[#5B6560]">
                      {s.street ? `${s.street}, ` : ""}
                      {s.city}
                      <span className="text-[#A9AFA9]"> · last order {s.lastOrder || "n/a"}</span>
                    </div>
                  </div>
                  <a
                    href={s.maps}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#2C6A46] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Ico name="pin" size={13} />
                    Drive
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <p className="mt-6 max-w-[70ch] text-[12.5px] leading-relaxed text-[#8A928C]">
        Sourced from the ERP customer list imported to HubSpot on 28 July 2026, verified against
        Google Places the same day. Accounts flagged call-first are ones Places reports as
        permanently closed at the address on file. Stop order within a day is nearest-neighbor
        by rooftop coordinates, not live traffic.
      </p>

      <div className="mt-8 grid gap-7 lg:grid-cols-2">
        {/* Cadence: who is due for a touch. Folded in from Today, 2026-08-02. */}
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Due for a touch
          </h2>
          {cadence.data.length === 0 ? (
            <Empty>
              {!isConfigured()
                ? "No data source configured."
                : "Nothing due. Every account has been touched within its cadence."}
            </Empty>
          ) : (
            <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
              {cadence.data.map((c) => (
                <li key={c.account_id}>
                  <AccountLink
                    id={c.account_id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FAF9F5]"
                  >
                    <TierChip tier={c.tier} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{c.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-[#8A928C]">
                        <span>{c.never_visited ? "never visited" : `last visit ${daysAgo(c.last_visit)}`}</span>
                        <span aria-hidden>·</span>
                        <Confidence
                          value={c.fit_confidence}
                          known={c.fit_inputs_known}
                          total={c.fit_inputs_total}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[12.5px] text-[#A0762C]">
                      {c.never_visited ? "first visit" : `${c.visit_days_overdue}d`}
                    </div>
                  </AccountLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pipeline loop: what has gone quiet. Folded in from Today, 2026-08-02. */}
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Gone quiet
          </h2>
          {stale.data.length === 0 ? (
            <Empty>
              {!isConfigured()
                ? "No data source configured."
                : "No deals yet. One appears here after you log a real conversation."}
            </Empty>
          ) : (
            <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
              {stale.data.map((d) => (
                <li key={d.deal_id}>
                  <AccountLink
                    id={d.account_id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FAF9F5]"
                  >
                    <TierChip tier={d.tier} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{d.account_name}</div>
                      <div className="mt-0.5 truncate text-[12px] text-[#8A928C]">
                        {d.stage} · {d.next_step ?? "no next step"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[12.5px] text-[#A0762C]">
                      {d.next_step_days_overdue != null && d.next_step_days_overdue > 0
                        ? `${d.next_step_days_overdue}d since next step`
                        : `${d.days_since_activity ?? "?"}d silent`}
                    </div>
                  </AccountLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Touchpoint capture. What you dictate here becomes an activity log entry
          and contact detail right away; any follow-up it hears waits below for
          your approval before it touches the calendar. Sits last: everything
          above is what you're about to do, this is the record of what you did. */}
      <section className="mt-8">
        <TouchpointCapture />
        <RecordVisit />
      </section>

      {proposals.data.length > 0 && (
        <section className="mt-7">
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
