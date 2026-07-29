/**
 * Plan. The SoCal month, sized to the Santa Cruz benchmark day.
 *
 * This is NOT the phase-7 route planner (see ../route): no Supabase, no drag
 * ordering, no ETA engine. It is the static monthly plan Juan approved on
 * 2026-07-28, shipped so the field days are readable and tappable from a phone.
 * Source of truth stays in bridges/nutribiotic; data.ts is generated, disposable.
 *
 * Every address is one big Apple Maps tap target, per the standing brief format:
 * he reads a day as a mind map and taps to drive to the next stop.
 */

import Link from "next/link";
import { PageHead, Card, Ico } from "../lib/ui";
import { MONTH_PLAN } from "./data";

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

export default function PlanPage() {
  return (
    <>
      <PageHead
        title="Plan"
        sub="The 62 active SoCal accounts in 8 field days plus one flex. Benchmark: the ten-stop Santa Cruz day. Clusters two hours out are sleep-aways."
      />

      {/* Tomorrow's briefed day gets top billing; the month follows. */}
      <Link
        href="/nutribiotic/plan/sf"
        className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-[#14201B] bg-[#14201B] p-5 text-[#F7F6F1] transition-opacity hover:opacity-90"
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#A8B3AC]">
            Briefed and ready · Thursday 30 July
          </div>
          <div className="mt-1 font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
            San Francisco and the Peninsula
          </div>
          <div className="mt-0.5 text-[13px] text-[#C9D2CC]">
            Six stops, counterclockwise loop. Open the day brief.
          </div>
        </div>
        <Ico name="route" size={22} />
      </Link>

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
    </>
  );
}
