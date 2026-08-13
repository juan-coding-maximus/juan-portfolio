/**
 * Outbound. A queue of drafts waiting on a human.
 *
 * Agency principle 1: drafting may be automatic once trusted, SENDING never is.
 * Nothing on this screen sends. Approval marks a row for the send worker, which
 * is the only code path that touches Gmail or LinkedIn, and which refuses any
 * synthetic row outright. A database trigger blocks the same transition
 * independently, so the two guards fail separately.
 */

import { listDrafts, isConfigured, type Draft } from "../lib/dal";
import { decideDraft } from "../lib/outbound-actions";
import { CopyBodyButton } from "../lib/outbound-ui";
import { Card, Empty, PageHead, daysAgo } from "../lib/ui";

export const dynamic = "force-dynamic";

/**
 * How long the whole compose URL may get before the body is left out.
 *
 * A deep-link is a query string, and percent-encoding roughly doubles a
 * markdown body once newlines and punctuation are escaped. Browsers and the
 * Outlook endpoint both stop carrying one somewhere in the low thousands of
 * characters, and the failure is quiet: the link still opens, just without the
 * text. 1900 is comfortably under the most conservative of those ceilings.
 */
const COMPOSE_URL_LIMIT = 1900;

/** Outlook Web compose, prefilled. Opens in a new tab; nothing sends until
 * Juan clicks Send inside his own mailbox — this mailbox holds no Mail.Send
 * scope, so a compose deep-link is the only path that exists.
 *
 * A body that will not fit is DROPPED RATHER THAN TRUNCATED, and the caller
 * offers a copy button instead. A half-sent email that looks complete is worse
 * than an empty compose window next to a copy button. */
function owaComposeLink(d: Draft): { href: string; bodyOmitted: boolean } {
  const base = "https://outlook.cloud.microsoft/mail/deeplink/compose?";
  const withBody = new URLSearchParams({ to: d.to_email ?? "", body: d.body_md });
  if (d.subject) withBody.set("subject", d.subject);
  const full = base + withBody;
  if (full.length <= COMPOSE_URL_LIMIT) return { href: full, bodyOmitted: false };

  const withoutBody = new URLSearchParams({ to: d.to_email ?? "" });
  if (d.subject) withoutBody.set("subject", d.subject);
  return { href: base + withoutBody, bodyOmitted: true };
}

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
                  {d.to_email && (
                    <span className="text-[12px] text-[#8A928C]">
                      {d.to_name ? `${d.to_name} · ` : ""}
                      {d.to_email}
                    </span>
                  )}
                  <span className="text-[12px] text-[#8A928C]">{daysAgo(d.created_at)}</span>
                  {/* The reason the queue is in this order. Shown only for the
                      two tiers that mean "do something", so the screen stays
                      quiet, and carrying its own evidence in the tooltip: a
                      priority with no stated reason is one nobody can correct. */}
                  {(d.urgency === 2 || d.urgency === 1) && (
                    <span
                      className={
                        d.urgency === 2
                          ? "rounded bg-[#F3E3C6] px-1.5 py-0.5 text-[11px] font-medium text-[#8A6D2F]"
                          : "rounded border border-[#DAD7CC] px-1.5 py-0.5 text-[11px] text-[#5B6560]"
                      }
                      title={d.urgency_reason ?? undefined}
                    >
                      {d.urgency === 2 ? "needs a reply today" : "soon"}
                    </span>
                  )}
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
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  {d.channel === "email" && d.to_email && !synthetic ? (
                    <>
                      <a
                        href={owaComposeLink(d).href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-[#14201B] px-3 py-1.5 text-[13px] font-medium text-[#F7F6F1]"
                      >
                        Open in Outlook &rarr;
                      </a>
                      {owaComposeLink(d).bodyOmitted && (
                        <>
                          <CopyBodyButton body={d.body_md} />
                          <span className="text-[12px] text-[#8A6D2F]">
                            Too long to prefill. Outlook opens addressed; paste the body in.
                          </span>
                        </>
                      )}
                      <form action={decideDraft.bind(null, d.id, "sent")}>
                        <button
                          type="submit"
                          className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44]"
                          title="Marks this sent on your word — this mailbox has no send access, so the OS can't verify it."
                        >
                          Mark sent
                        </button>
                      </form>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={synthetic || !d.to_email}
                      className="rounded-md bg-[#14201B] px-3 py-1.5 text-[13px] font-medium text-[#F7F6F1] disabled:opacity-35"
                      title={
                        synthetic
                          ? "Synthetic drafts cannot be approved for sending."
                          : !d.to_email
                            ? "No email on file for this account — call instead."
                            : undefined
                      }
                    >
                      Approve
                    </button>
                  )}
                  <form action={decideDraft.bind(null, d.id, "dismissed")}>
                    <button
                      type="submit"
                      className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44]"
                    >
                      Dismiss
                    </button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
