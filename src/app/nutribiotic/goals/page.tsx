/**
 * Goals. The ladder, posted where it is seen every day.
 *
 * THE LADDER IS STATIC, THE BASELINES ARE NOT (2026-09-18). A goal changes at a
 * QBR, so NORTH_STAR, GOALS, ARC and CADENCE mirror
 * agency/nutribiotic/playbook/GOALS.md and change when it does. The numbers
 * those goals are judged against used to be mirrored the same way and were
 * stale most of the time, so the three that can be counted are read live
 * (getGoalBaselines) and the two that cannot carry the date they were measured.
 */

import Link from "next/link";
import { getGoalBaselines } from "../lib/dal";
import { PageHead, Card, Ico } from "../lib/ui";
import { NORTH_STAR, STATED_BASELINES, GOALS, ARC, CADENCE } from "./data";

export const metadata = { title: "Goals · NutriBiotic OS" };

// The baselines are counted on load, so the ladder is never judged against
// last month's territory.
export const dynamic = "force-dynamic";

function ProposedTag() {
  return (
    <span className="inline-flex items-center rounded bg-[#FBF6E9] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#8A6D2F]">
      Proposed
    </span>
  );
}

export default async function GoalsPage() {
  const live = await getGoalBaselines();
  // A failed read drops the three live cards rather than printing a zero he
  // would have to disprove. The two dated ones stand on their own date.
  const baselines = [
    ...(live
      ? [
          { value: String(live.accountsOwned), label: "SoCal accounts owned", asOf: null },
          { value: String(live.orderedSince2024), label: "ordered since 2024", asOf: null },
          { value: String(live.withNamedContact), label: "with a named contact", asOf: null },
        ]
      : []),
    ...STATED_BASELINES,
  ];

  return (
    <>
      <PageHead title="Goals" />

      {/* The mantra. The one thing to remember if nothing else is read. */}
      <div className="mb-6 rounded-lg border border-[#14201B] bg-[#14201B] p-6 text-[#F7F6F1]">
        <div className="font-[family-name:var(--font-fraunces)] text-[26px] font-semibold tracking-tight">
          {NORTH_STAR.mantra}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {NORTH_STAR.milestones.map((m) => (
            <div key={m.title} className="rounded-md border border-[#2C3A33] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-[family-name:var(--font-fraunces)] text-[16.5px] font-semibold tracking-tight">
                  {m.title}
                </div>
                <div className="shrink-0 text-[12px] uppercase tracking-[0.14em] text-[#A8B3AC]">
                  {m.deadline}
                </div>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#C9D2CC]">{m.proof}</p>
            </div>
          ))}
        </div>
      </div>

      {/* The numbers every goal is judged against. Three counted on load, two
          carrying the date they were measured, because nothing can count them. */}
      <div
        className={`mb-6 grid grid-cols-2 gap-3 ${
          baselines.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-2"
        }`}
      >
        {baselines.map((b) => (
          <Card key={b.label} className="p-3.5 text-center">
            <div className="font-[family-name:var(--font-fraunces)] text-[22px] leading-none font-semibold tracking-tight">
              {b.value}
            </div>
            <div className="mt-1.5 text-[11px] leading-snug text-[#5B6560]">{b.label}</div>
            {b.asOf && <div className="mt-1 text-[10.5px] text-[#A9AFA9]">{b.asOf}</div>}
          </Card>
        ))}
      </div>

      {/* The six Year-1 goals. */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {GOALS.map((g) => (
          <Card key={g.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-fraunces)] text-[13px] font-bold text-[#2C6A46]">
                  {g.id}
                </span>
                <span className="font-[family-name:var(--font-fraunces)] text-[16.5px] font-semibold tracking-tight">
                  {g.title}
                </span>
              </div>
              <span className="shrink-0 text-[11.5px] uppercase tracking-[0.1em] text-[#8A928C]">
                {g.deadline}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-[#3D4A44]">{g.what}</p>
            <div className="mt-auto rounded-md bg-[#F3F1EA] px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5"><Ico name="metrics" size={12} /></span>
                <p className="text-[12.5px] leading-relaxed text-[#3D4A44]">{g.measure}</p>
              </div>
              {g.proposed && (
                <div className="mt-1.5">
                  <ProposedTag />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Years 2 to 4, the arc to VP. */}
      <Card className="mb-6">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8A928C]">
          The arc to VP
        </div>
        <ul className="flex flex-col gap-2.5">
          {ARC.map((a) => (
            <li key={a.span} className="flex gap-3 text-[13px] leading-relaxed">
              <span className="w-14 shrink-0 font-[family-name:var(--font-fraunces)] font-semibold">
                {a.span}
              </span>
              <span className="text-[#3D4A44]">{a.line}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Cadence: how the ladder stays honest. */}
      <Card>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8A928C]">
          Cadence
        </div>
        <ul className="flex flex-col gap-2.5">
          {CADENCE.map((c) => (
            <li key={c.when} className="flex gap-3 text-[13px] leading-relaxed">
              <span className="w-28 shrink-0 font-medium">{c.when}</span>
              <span className="text-[#3D4A44]">{c.what}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-6 max-w-[70ch] text-[12.5px] leading-relaxed text-[#8A928C]">
        This tab is the designed summary. The full ladder, with baseline sources and the SMART
        breakdown per goal, is{" "}
        <Link
          href="/nutribiotic/playbook/goals"
          className="font-medium text-[#2C6A46] underline decoration-[#2C6A46]/40 underline-offset-2 hover:decoration-[#2C6A46]"
        >
          GOALS.md on the Playbook shelf
        </Link>
        , the source of truth this page mirrors.
      </p>
    </>
  );
}
