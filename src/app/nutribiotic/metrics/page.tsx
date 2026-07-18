/**
 * Metrics. Two loops, deliberately never mixed in one panel.
 *
 * LEADING is reviewed daily and is entirely within Juan's control.
 * LAGGING is reviewed weekly and is the result of work done about 90 days ago.
 *
 * Putting them in one grid is how a rep talks themselves out of prospecting on a
 * slow week. They are separated here structurally, not just spatially.
 *
 * REVENUE IS RENDERED WITH ITS PROVENANCE. Order data most likely lives in
 * NutriBiotic's ERP rather than HubSpot, so until source coverage is high the
 * revenue tile shows as an estimate with its coverage attached. A number whose
 * origin cannot be stated is not reported as fact.
 */

import { leadingDaily, reactivation, revenueByMonth } from "../lib/dal";
import { Card, Empty, PageHead, Stat, money } from "../lib/ui";

export const dynamic = "force-dynamic";

const TARGET_12MO = 450_000;
const TARGET_REACTIVATIONS = 100;

export default async function Metrics() {
  const [rev, react, leading] = await Promise.all([
    revenueByMonth(),
    reactivation(),
    leadingDaily(30),
  ]);

  const months = rev.data.slice(0, 12);
  const revenue12 = months.reduce((s, m) => s + (m.revenue || 0), 0);
  const coverage =
    months.length > 0
      ? months.reduce((s, m) => s + (m.source_coverage_pct ?? 0), 0) / months.length
      : 0;
  const lowCoverage = coverage < 80;

  const r = react.data[0];
  const l30 = leading.data.reduce(
    (acc, d) => ({
      visits: acc.visits + (d.visits || 0),
      replies: acc.replies + (d.replies_in || 0),
      samples: acc.samples + (d.samples_dropped || 0),
      trainings: acc.trainings + (d.staff_trainings || 0),
    }),
    { visits: 0, replies: 0, samples: 0, trainings: 0 },
  );

  if (rev.mode === "empty" && react.mode === "empty" && leading.mode === "empty") {
    return (
      <>
        <PageHead title="Metrics" />
        <Empty>No data source configured yet. Nothing is being shown and nothing is estimated.</Empty>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Metrics"
        sub="Leading indicators are reviewed daily and are yours to control. Lagging indicators are reviewed weekly and reflect work done about 90 days ago. They are kept apart on purpose."
      />

      <section className="mb-8">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
          Lagging · reviewed weekly
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Revenue, trailing 12mo"
            value={money(revenue12)}
            hint={`${((revenue12 / TARGET_12MO) * 100).toFixed(0)}% of the ${money(TARGET_12MO)} target`}
            caution={
              lowCoverage
                ? `Estimate. Only ${coverage.toFixed(0)}% of orders carry a verified source, so treat this as directional.`
                : undefined
            }
          />
          <Stat
            label="Accounts reactivated"
            value={String(r?.accounts_reactivated ?? 0)}
            hint={`of ${TARGET_REACTIVATIONS} target · counts second orders only`}
          />
          <Stat
            label="Trial to reorder"
            value={r?.trial_to_reorder_pct != null ? `${r.trial_to_reorder_pct}%` : "not known"}
            hint="the rate that actually decides the year"
          />
          <Stat
            label="Days trial to reorder"
            value={
              r?.avg_days_trial_to_reorder != null ? `${r.avg_days_trial_to_reorder}` : "not known"
            }
            hint="average, where a reorder happened"
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
          Leading · reviewed daily
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Visits" value={String(l30.visits)} hint="last 30 days" />
          <Stat label="Replies received" value={String(l30.replies)} hint="last 30 days" />
          <Stat label="Samples dropped" value={String(l30.samples)} hint="last 30 days" />
          <Stat label="Staff trainings" value={String(l30.trainings)} hint="last 30 days" />
        </div>
      </section>

      <Card>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
          On reading these together
        </div>
        <p className="max-w-[74ch] text-[13.5px] leading-relaxed text-[#5B6560]">
          Prospecting done this month shows up in revenue roughly three months from now. Judging a
          week of doors by the same week&apos;s revenue is the fastest way to stop knocking, and the
          pipeline goes quiet a quarter later when it is far too late to fix. Read the leading panel
          for whether the work happened, and the lagging panel for whether the work was aimed
          correctly.
        </p>
      </Card>
    </>
  );
}
