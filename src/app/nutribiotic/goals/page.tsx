/**
 * Goals. The ladder, posted where it is seen every day.
 *
 * Static by design: a goal changes at a QBR, not on a request cycle. Source of
 * truth is agency/nutribiotic/playbook/GOALS.md; data.ts mirrors it. The page's
 * one job is to make the ladder impossible to forget: the mantra on top, the six
 * goals under it, the measured baselines they are judged against.
 */

import Link from "next/link";
import { PageHead, Card, Ico } from "../lib/ui";
import { NORTH_STAR, BASELINES, GOALS, ARC, CADENCE } from "./data";

export const metadata = { title: "Goals · NutriBiotic OS" };

function ProposedTag() {
  return (
    <span className="inline-flex items-center rounded bg-[#FBF6E9] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#8A6D2F]">
      Proposed
    </span>
  );
}

export default function GoalsPage() {
  return (
    <>
      <PageHead
        title="Goals"
        sub="The ladder. Targets marked proposed are ratified or re-set at each QBR; baselines are measured, sourced numbers."
      />

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

      {/* Measured baselines: the numbers every goal is judged against. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {BASELINES.map((b) => (
          <Card key={b.label} className="p-3.5 text-center">
            <div className="font-[family-name:var(--font-fraunces)] text-[22px] leading-none font-semibold tracking-tight">
              {b.value}
            </div>
            <div className="mt-1.5 text-[11px] leading-snug text-[#5B6560]">{b.label}</div>
          </Card>
        ))}
      </div>
      <p className="mb-6 -mt-3 text-[11.5px] text-[#8A928C]">
        Baselines measured 2026-08-02 from the OS and the ERP export. Sources in GOALS.md.
      </p>

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
