/**
 * Clients. Every prospect in the territory, ranked, with the pipeline over it.
 *
 * This absorbed the old Pipeline tab (2026-07-20). A pipeline is a view over
 * the same accounts, and while the territory is pre-first-visit a separate
 * board was seven columns of empty ceremony. The stage board and the weekly
 * review render here, and only once deals exist; the ranked account list is
 * the permanent core of the screen.
 *
 * DEFAULT SORT IS (tier, confidence desc), NOT fit desc. Most fit scores currently
 * rest on one or two measured inputs out of three, and a list sorted purely by
 * value would present a confidently-ranked pile of noise as a work queue.
 *
 * Scores are also shrunk toward a neutral prior in proportion to what is
 * unmeasured, so a barely-known account cannot inherit the optimism of its single
 * lucky input. Before that was added, researching an account LOWERED its rank,
 * which is the exact opposite of the behavior this list should encourage.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import {
  listAccounts,
  listAreas,
  listDeals,
  listStaleDeals,
  isConfigured,
} from "../lib/dal";
import { AccountLink } from "../lib/modal";
import { Card, Confidence, Empty, Ico, PageHead, TierChip } from "../lib/ui";

export const dynamic = "force-dynamic";

type Criterion = { stage: string; label: string; criterion: string };

async function loadCriteria(): Promise<Criterion[]> {
  try {
    const p = path.join(process.cwd(), "..", "nutribiotic", "config", "stage_criteria.json");
    const j = JSON.parse(await readFile(p, "utf8")) as { stages: Criterion[] };
    return j.stages;
  } catch {
    // The config lives in the agency repo, which is not deployed alongside the
    // portfolio. Degrade to stage names rather than inventing criteria.
    return [];
  }
}

const ORDER = ["identified", "contacted", "discovery", "sampled", "trial", "stocked", "reordered"];

export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const sp = await searchParams;

  const [areas, deals, stale, criteria] = await Promise.all([
    listAreas(),
    listDeals(),
    listStaleDeals(20),
    loadCriteria(),
  ]);
  /* An unknown ?area= is dropped rather than 404'd or passed through. A stale
     bookmark from before the areas were redrawn should land on the whole territory,
     not on an empty table that reads as "you have no accounts here". */
  const area = areas.find((a) => a.id === sp.area) ?? null;
  const accounts = await listAccounts({ area: area?.id ?? null });
  const rows = accounts.data;

  const byTier = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
  for (const r of rows) {
    byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
  }

  const byStage = new Map<string, typeof deals.data>();
  for (const d of deals.data) {
    if (!byStage.has(d.stage)) byStage.set(d.stage, []);
    byStage.get(d.stage)!.push(d);
  }
  const crit = new Map(criteria.map((c) => [c.stage, c]));
  const staleIds = new Set(stale.data.map((s) => s.deal_id));

  return (
    <>
      <PageHead
        title="Clients"
        sub={
          area
            ? `${area.label}. ${area.brief ?? ""}`.trim()
            : "Your 273 accounts, sorted by tier, then by how much we actually know. An account we know nothing about does not get to sit at the top of the list because its one measured input happened to be high."
        }
      />

      {/* The territory, divided into the areas Juan actually drives. Each carries its
          own colour, and the same colour fills its frontier on the map, so the chip and
          the region are visibly one thing rather than two lists to reconcile.

          The count on each chip comes from the same view the table below reads. Two
          reads would agree until something wrote between them, and then the chip would
          say 31 above a list of 30 with no way to tell which was lying. */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Link
          href="/nutribiotic/clients"
          className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
            !area
              ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
              : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
          }`}
        >
          All accounts
        </Link>
        {areas.map((a) => {
          const on = area?.id === a.id;
          return (
            <Link
              key={a.id}
              href={`/nutribiotic/clients?area=${a.id}`}
              title={a.brief ?? undefined}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                on
                  ? "text-[#F7F6F1]"
                  : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
              }`}
              style={on ? { background: a.color, borderColor: a.color } : undefined}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: on ? "#F7F6F1" : a.color }}
              />
              {a.label}
              <span className={on ? "opacity-70" : "text-[#8A928C]"}>{a.account_count}</span>
              {/* An area Juan did not name is flagged wherever it appears. It exists so
                  the map tiles with no gaps, not because he drew this line. */}
              {a.needs_review && (
                <span className={on ? "opacity-70" : "text-[#A0762C]"} title="Not an area you named. These accounts are north of anything you described, and need a call.">
                  ?
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* The pipeline, only once it exists. A stage is an observable fact about
          the buyer, not a feeling about the deal; advancing one requires citing
          the activity that proves it. */}
      {deals.data.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Pipeline
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ORDER.map((stage) => {
              const items = byStage.get(stage) ?? [];
              const c = crit.get(stage);
              return (
                <Card key={stage} className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[13.5px] font-semibold capitalize">
                      {c?.label ?? stage}
                    </div>
                    <div className="text-[12px] tabular-nums text-[#8A928C]">{items.length}</div>
                  </div>
                  {c && (
                    <p className="mt-1.5 border-l-2 border-[#E2DFD5] pl-2 text-[11.5px] leading-snug text-[#8A928C]">
                      {c.criterion}
                    </p>
                  )}
                  <ul className="mt-3 flex flex-col gap-1">
                    {items.slice(0, 6).map((d) => (
                      <li key={d.id}>
                        <AccountLink
                          id={d.account_id}
                          className="flex items-baseline justify-between gap-2 rounded px-1.5 py-1 text-[13px] transition-colors hover:bg-[#F4F2EA]"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {d.next_step ?? "no next step"}
                          </span>
                          {staleIds.has(d.id) && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#A0762C]"
                              title="flagged for weekly review"
                              aria-label="flagged for weekly review"
                            />
                          )}
                        </AccountLink>
                      </li>
                    ))}
                    {items.length > 6 && (
                      <li className="px-1.5 pt-0.5 text-[11.5px] text-[#8A928C]">
                        and {items.length - 6} more
                      </li>
                    )}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ONE LIST, NARROWED. Picking an area used to switch to a different table
          ordered by distance from a city centre. An area is already about a day's
          drive, so inside it the question goes back to who is worth the call rather
          than what is nearest, and two tables with two orderings was a second thing
          to keep true for no answer it gave. */}
      {rows.length === 0 ? (
        <Empty>
          {!isConfigured()
            ? "No data source configured."
            : "No accounts yet. Load prospects to get started."}
        </Empty>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-[#5B6560]">
            <span>{rows.length} accounts</span>
            {(["A", "B", "C", "D"] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <TierChip tier={t} />
                {byTier[t] ?? 0}
              </span>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#E2DFD5] text-left text-[11px] uppercase tracking-[0.12em] text-[#8A928C]">
                  <th className="px-4 py-2.5 font-medium">Tier</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 font-medium">State</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fit</th>
                  <th className="px-4 py-2.5 font-medium">Known</th>
                  <th className="px-4 py-2.5 text-right font-medium">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDEBE3]">
                {rows.map((r) => {
                  const low = (r.fit_confidence ?? 0) < 0.5;
                  return (
                    <tr key={r.account_id} className="transition-colors hover:bg-[#FAF9F5]">
                      <td className="px-4 py-2.5">
                        <TierChip tier={r.tier} />
                      </td>
                      <td className="px-4 py-2.5">
                        <AccountLink
                          id={r.account_id}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {r.name}
                        </AccountLink>
                      </td>
                      <td className="px-4 py-2.5 text-[#5B6560]">{r.lifecycle}</td>
                      {/* Low-confidence scores are visually demoted so a weak
                          number never reads with the same authority as a measured one. */}
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${
                          low ? "text-[#A79878]" : ""
                        }`}
                      >
                        {r.fit?.toFixed(0) ?? "-"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Confidence
                          value={r.fit_confidence}
                          known={r.fit_inputs_known}
                          total={r.fit_inputs_total}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#5B6560]">
                        {r.engagement?.toFixed(0) ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Weekly review, from the old Pipeline tab. */}
          {deals.data.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
                Weekly review
              </h2>
              <p className="mb-3 max-w-[70ch] text-[13.5px] leading-relaxed text-[#5B6560]">
                Same 30 minutes every week. Each of these gets one question: what is the next step and
                when. Anything without a real answer gets killed or recycled. A pipeline padded with
                deals nobody believes in makes every other number on this screen meaningless.
              </p>
              {stale.data.length === 0 ? (
                <Empty>Nothing stale. Every open deal has a next step with a future date.</Empty>
              ) : (
                <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
                  {stale.data.map((s) => (
                    <li key={s.deal_id}>
                      <AccountLink
                        id={s.account_id}
                        className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] transition-colors hover:bg-[#FAF9F5]"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{s.account_name}</span>
                        <span className="w-[92px] shrink-0 text-[12px] text-[#8A928C]">{s.stage}</span>
                        <span className="shrink-0 text-[12px] text-[#A0762C]">
                          {s.next_step_days_overdue != null && s.next_step_days_overdue > 0
                            ? `${s.next_step_days_overdue}d since next step`
                            : `${s.days_since_activity ?? "?"}d silent`}
                        </span>
                      </AccountLink>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
