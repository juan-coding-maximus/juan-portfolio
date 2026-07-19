/**
 * Outbound. A queue of drafts waiting on a human.
 *
 * Agency principle 1: drafting may be automatic once trusted, SENDING never is.
 * Nothing on this screen sends. Approval marks a row for the send worker, which
 * is the only code path that touches Gmail or LinkedIn, and which refuses any
 * synthetic row outright. A database trigger blocks the same transition
 * independently, so the two guards fail separately.
 */

import { listDrafts , isConfigured } from "../lib/dal";
import { Card, Empty, PageHead, daysAgo } from "../lib/ui";

export const dynamic = "force-dynamic";

export default async function Outbound() {
  const res = await listDrafts();
  const synthetic = res.mode === "synthetic";

  return (
    <>
      <PageHead
        title="Outbound"
        sub="Drafts wait here until you approve them. Nothing on this screen sends anything."
      />

      {synthetic && (
        <Card className="mb-5 border-l-[3px] border-l-[#E8A33D]">
          <p className="text-[13.5px] leading-relaxed text-[#5B6560]">
            These drafts are synthetic. They cannot be sent: the send worker refuses any row marked
            synthetic, and the database blocks the status change independently of it. Every
            recipient address here uses a reserved domain that can never resolve.
          </p>
        </Card>
      )}

      {res.data.length === 0 ? (
        <Empty>
          {!isConfigured() ? "No data source configured." : "No drafts waiting on you."}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {res.data.map((d) => (
            <li key={d.id}>
              <Card>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                    {d.channel}
                  </span>
                  {d.subject && <span className="text-[14px] font-medium">{d.subject}</span>}
                  <span className="text-[12px] text-[#8A928C]">{daysAgo(d.created_at)}</span>
                  {d.play_key && (
                    <span
                      className="rounded bg-[#ECEAE1] px-1.5 py-0.5 text-[11px] text-[#3D4A44]"
                      title="Which play produced this draft. Recorded so reply rates can be compared by approach."
                    >
                      {d.play_key.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <p className="max-w-[76ch] text-[13.5px] leading-relaxed whitespace-pre-wrap text-[#3D4A44]">
                  {d.body_md}
                </p>
                <div className="mt-3.5 flex gap-2">
                  <button
                    type="button"
                    disabled={synthetic}
                    className="rounded-md bg-[#14201B] px-3 py-1.5 text-[13px] font-medium text-[#F7F6F1] disabled:opacity-35"
                    title={synthetic ? "Synthetic drafts cannot be approved for sending." : undefined}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44]"
                  >
                    Dismiss
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
