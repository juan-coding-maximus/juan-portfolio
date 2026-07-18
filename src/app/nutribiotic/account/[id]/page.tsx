/**
 * Account detail. The screen read in the car before walking in.
 *
 * Ordering is the visit itself: who they are, what the gap is, what you must not
 * forget, then the history. Quirks sit high because in specialty retail the
 * relationship detail is the thing that makes the next ten minutes work.
 */

import { notFound } from "next/navigation";
import { getAccount, listActivities } from "../../lib/dal";
import { Card, Empty, Ico, PageHead, daysAgo, money } from "../../lib/ui";

export const dynamic = "force-dynamic";

export default async function AccountDetail({
  params,
}: {
  // Next 16: route params arrive as a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [acc, acts] = await Promise.all([getAccount(id), listActivities(id)]);
  const a = acc.data[0];
  if (!a) notFound();

  const gap = a.current_state || a.future_state || a.impact;

  return (
    <>
      <PageHead
        title={a.name}
        sub={[a.channel, [a.street, a.city, a.postal].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · ")}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {/* Quirks first. This is what makes or breaks the visit. */}
          {a.quirks && (
            <Card className="border-l-[3px] border-l-[#14201B]">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                <Ico name="pin" size={13} />
                Field notes
              </div>
              <p className="text-[14.5px] leading-relaxed">{a.quirks}</p>
            </Card>
          )}

          {/* Gap Selling. Diagnosis before pitch. */}
          <Card>
            <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
              The gap
            </div>
            {gap ? (
              <dl className="flex flex-col gap-3 text-[14px]">
                {[
                  ["Where they are now", a.current_state],
                  ["Where they could be", a.future_state],
                  ["What the gap costs them", a.impact],
                ].map(([label, val]) =>
                  val ? (
                    <div key={label as string}>
                      <dt className="text-[12px] text-[#8A928C]">{label}</dt>
                      <dd className="mt-0.5 leading-relaxed">{val}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            ) : (
              <p className="text-[13.5px] leading-relaxed text-[#5B6560]">
                Not diagnosed yet. Discovery cannot be marked complete until current state, future
                state, and impact are captured in the buyer&apos;s own numbers. Ask what is turning
                slowest and what customers ask for that they cannot supply.
              </p>
            )}
          </Card>

          {/* History. Append-only, so this is the real record. */}
          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
              History
            </h2>
            {acts.data.length === 0 ? (
              <Empty>No activity logged.</Empty>
            ) : (
              <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
                {acts.data.map((t) => (
                  <li key={t.id} className="flex items-baseline gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="w-[86px] shrink-0 text-[12px] text-[#8A928C]">
                      {daysAgo(t.at)}
                    </span>
                    <span className="w-[104px] shrink-0 font-medium">{t.kind.replace(/_/g, " ")}</span>
                    <span className="min-w-0 flex-1 truncate text-[#5B6560]">
                      {t.detail ?? t.outcome?.replace(/_/g, " ") ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <dl className="flex flex-col gap-2.5 text-[13.5px]">
              {[
                ["State", a.lifecycle],
                ["Last order", a.last_order_at ? daysAgo(a.last_order_at) : "never"],
                ["Lifetime", money(a.lifetime_revenue)],
                ["Trailing 12mo", money(a.trailing_12m_revenue)],
                ["Reorder due", a.expected_reorder_at ?? "not set"],
                ["Phone", a.phone ?? "not known"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3">
                  <dt className="text-[#8A928C]">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {a.business_hours && (
            <Card>
              <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                Hours
              </div>
              <dl className="flex flex-col gap-1 text-[13px]">
                {Object.entries(a.business_hours).map(([day, ranges]) => (
                  <div key={day} className="flex justify-between gap-3">
                    <dt className="text-[#8A928C] capitalize">{day}</dt>
                    <dd className="tabular-nums">
                      {ranges.length ? ranges.map((r) => r.join(" to ")).join(", ") : "closed"}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
