/**
 * Accounts. Every prospect in the territory, ranked.
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

import Link from "next/link";
import { listAccounts , isConfigured } from "../lib/dal";
import { Confidence, Empty, PageHead, TierChip } from "../lib/ui";

export const dynamic = "force-dynamic";

export default async function Accounts() {
  const res = await listAccounts();
  const rows = res.data;

  const byTier = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
  let lowConf = 0;
  for (const r of rows) {
    byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
    if ((r.fit_confidence ?? 0) < 0.5) lowConf += 1;
  }

  return (
    <>
      <PageHead
        title="Accounts"
        sub="Sorted by tier, then by how much we actually know. An account we know nothing about does not get to sit at the top of the list because its one measured input happened to be high."
      />

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
            {lowConf > 0 && (
              <span className="text-[#A0762C]">
                {lowConf} scored below the confidence floor, barred from route band 1
              </span>
            )}
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
                        <Link
                          href={`/nutribiotic/account/${r.account_id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {r.name}
                        </Link>
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
        </>
      )}
    </>
  );
}
