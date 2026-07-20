/**
 * Pipeline. Deals by stage, with exit criteria visible.
 *
 * The stage columns carry their exit criterion in the header, because a stage
 * whose definition lives in a config file nobody opens is a stage that drifts
 * back into meaning "how I feel about this deal". The database enforces that an
 * advance cites evidence; this screen makes the criterion legible while working.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { listDeals, listStaleDeals , isConfigured } from "../lib/dal";
import { AccountLink } from "../lib/modal";
import { Card, Empty, PageHead } from "../lib/ui";

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

export default async function Pipeline() {
  const [deals, stale, criteria] = await Promise.all([
    listDeals(),
    listStaleDeals(20),
    loadCriteria(),
  ]);

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
        title="Pipeline"
        sub="A stage is an observable fact about the buyer, not a feeling about the deal. Advancing one requires citing the activity that proves it."
      />

      {deals.data.length === 0 ? (
        <Empty>
          {!isConfigured()
            ? "No data source configured."
            : "No open deals yet. A deal appears here once you log a real conversation."}
        </Empty>
      ) : (
        <>
          <div className="mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

          <section>
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
        </>
      )}
    </>
  );
}
