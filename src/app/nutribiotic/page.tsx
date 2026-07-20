/**
 * Today. The screen Juan opens in the morning and looks at from the car.
 *
 * Ordered by the two loops the OS runs: what is happening today (the daily
 * activity loop), then what has gone quiet (the pipeline loop). The protected
 * prospecting block sits between them on purpose, because it is the thing that
 * gets eaten when the day gets busy.
 */

import Link from "next/link";
import { isConfigured, listCadenceDue, listStaleDeals, leadingDaily } from "./lib/dal";
import { Card, Confidence, Empty, Ico, PageHead, TierChip, daysAgo } from "./lib/ui";

export const dynamic = "force-dynamic";

export default async function Today() {
  const [cadence, stale, leading] = await Promise.all([
    listCadenceDue(12),
    listStaleDeals(8),
    leadingDaily(7),
  ]);

  const week = leading.data.reduce(
    (acc, d) => ({
      visits: acc.visits + (d.visits || 0),
      calls: acc.calls + (d.calls || 0),
      samples: acc.samples + (d.samples_dropped || 0),
      replies: acc.replies + (d.replies_in || 0),
    }),
    { visits: 0, calls: 0, samples: 0, replies: 0 },
  );

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <PageHead
        title={today}
        sub="Cadence nudges are suggestions, not tasks. Nothing here has a status and nothing is counting against you."
      />

      {/* Leading indicators. Reviewed daily, fully within your control. */}
      <section className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Visits", week.visits, "last 7 days"],
          ["Calls", week.calls, "last 7 days"],
          ["Samples", week.samples, "last 7 days"],
          ["Replies in", week.replies, "last 7 days"],
        ].map(([label, value, hint]) => (
          <Card key={label as string} className="p-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">{label}</div>
            <div className="mt-1.5 font-[family-name:var(--font-fraunces)] text-[26px] leading-none font-semibold">
              {value as number}
            </div>
            <div className="mt-1 text-[11.5px] text-[#8A928C]">{hint}</div>
          </Card>
        ))}
      </section>

      {/* The protected block. Sits above the work queues deliberately. */}
      <section className="mb-7">
        <Card className="border-l-[3px] border-l-[#14201B]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-[#14201B]">
              <Ico name="clock" />
            </div>
            <div>
              <div className="text-[14.5px] font-semibold">Prospecting block · 09:00 to 10:30</div>
              <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-[#5B6560]">
                New doors only. Service work for existing accounts does not go here. This block is
                what pays out in about 90 days, which is exactly why it is the first thing a busy
                week deletes.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <div className="grid gap-7 lg:grid-cols-2">
        {/* Cadence: who is overdue for a touch. */}
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Overdue for a touch
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
                  <Link
                    href={`/nutribiotic/account/${c.account_id}`}
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
                      {c.never_visited ? "first visit" : `${c.visit_days_overdue}d over`}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pipeline loop: what has gone quiet. Feeds the weekly review. */}
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
                  <Link
                    href={`/nutribiotic/account/${d.account_id}`}
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
                        ? `${d.next_step_days_overdue}d late`
                        : `${d.days_since_activity ?? "?"}d silent`}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Route and Support left the nav in the 2026-07-20 consolidation but
          keep their pages; this is their doorway until their phases ship. */}
      <p className="mt-8 text-[12.5px] text-[#8A928C]">
        Also here:{" "}
        <Link href="/nutribiotic/route" className="underline underline-offset-2 hover:text-[#14201B]">
          Route
        </Link>{" "}
        (planner, phase 7) ·{" "}
        <Link href="/nutribiotic/support" className="underline underline-offset-2 hover:text-[#14201B]">
          Support log
        </Link>
      </p>
    </>
  );
}
