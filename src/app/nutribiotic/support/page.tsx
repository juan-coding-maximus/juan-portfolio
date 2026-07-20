/**
 * Support. A log, not a ticketing system.
 *
 * Juan is first point of contact and forwards everything to HQ, resolving
 * nothing. So there is no assignment, no SLA, no priority, no threading. Three
 * statuses. Every field this screen does NOT have is a deliberate omission, and
 * the discipline is keeping it that way: each addition is one more thing that
 * goes stale in service of a process he does not own.
 */

import { listSupportIssues , isConfigured } from "../lib/dal";
import { AccountLink } from "../lib/modal";
import { Empty, PageHead, daysAgo } from "../lib/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "Not yet forwarded",
  forwarded: "With HQ",
  closed_by_hq: "Closed by HQ",
};

export default async function Support() {
  const res = await listSupportIssues();
  const open = res.data.filter((i) => i.status === "open");

  return (
    <>
      <PageHead
        title="Support"
        sub="Triage only. Log the issue, forward it to HQ, record that it went. Nothing here is resolved in this system."
      />

      {res.data.length === 0 ? (
        <Empty>
          {!isConfigured() ? "No data source configured." : "No issues logged. Nothing to forward to HQ."}
        </Empty>
      ) : (
        <>
          {open.length > 0 && (
            <p className="mb-4 text-[13.5px] text-[#A0762C]">
              {open.length} issue{open.length === 1 ? "" : "s"} not yet forwarded to HQ.
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#E2DFD5] text-left text-[11px] uppercase tracking-[0.12em] text-[#8A928C]">
                  <th className="px-4 py-2.5 font-medium">Raised</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Summary</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDEBE3]">
                {res.data.map((i) => (
                  <tr key={i.id} className="transition-colors hover:bg-[#FAF9F5]">
                    <td className="px-4 py-2.5 whitespace-nowrap text-[#5B6560]">
                      {daysAgo(i.raised_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <AccountLink
                        id={i.account_id}
                        className="underline-offset-2 hover:underline"
                      >
                        {i.account_id}
                      </AccountLink>
                    </td>
                    <td className="px-4 py-2.5 text-[#5B6560]">{i.issue_type.replace(/_/g, " ")}</td>
                    <td className="max-w-[38ch] truncate px-4 py-2.5">{i.summary}</td>
                    <td
                      className={`px-4 py-2.5 whitespace-nowrap ${
                        i.status === "open" ? "text-[#A0762C]" : "text-[#5B6560]"
                      }`}
                    >
                      {STATUS_LABEL[i.status] ?? i.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
