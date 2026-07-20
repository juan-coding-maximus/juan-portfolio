/**
 * The account profile body. Pure presentation, no data fetching, so it renders
 * identically whether it lands on the standalone /account/[id] page (deep
 * link, direct visit) or inside the pop-up modal every list link opens by
 * default (see modal.tsx). One shape, two hosts.
 */

import type { Account, Activity, Contact } from "./dal";
import { Card, Empty, Ico, PhoneDisplay, daysAgo, money } from "./ui";

const SOCIAL_LINKS = (a: Account) =>
  [
    a.website && { href: a.website, label: a.website.replace(/^https?:\/\//, ""), icon: "globe" as const },
    a.email && { href: `mailto:${a.email}`, label: a.email, icon: "mail" as const },
    a.instagram_url && { href: a.instagram_url, label: "Instagram", icon: "instagram" as const },
    a.facebook_url && { href: a.facebook_url, label: "Facebook", icon: "facebook" as const },
    a.linkedin_url && { href: a.linkedin_url, label: "LinkedIn", icon: "linkedin" as const },
  ].filter(Boolean) as { href: string; label: string; icon: "globe" | "mail" | "instagram" | "facebook" | "linkedin" }[];

export function AccountDetailBody({
  account: a,
  activities: acts,
  contacts,
}: {
  account: Account;
  activities: Activity[];
  contacts: Contact[];
}) {
  const gap = a.current_state || a.future_state || a.impact;
  const links = SOCIAL_LINKS(a);

  return (
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

        {/* People. Who you are actually meeting. */}
        {contacts.length > 0 && (
          <Card>
            <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">People</div>
            <ul className="flex flex-col gap-3">
              {contacts.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Name not known";
                return (
                  <li key={c.id} className="flex flex-col gap-0.5 text-[13.5px]">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{name}</span>
                      {c.title && <span className="text-[12px] text-[#8A928C]">{c.title}</span>}
                      {c.is_decision_maker && (
                        <span className="rounded bg-[#ECEAE1] px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide text-[#3D4A44] uppercase">
                          Decision maker
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[#5B6560]">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="underline-offset-2 hover:underline">
                          {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="underline-offset-2 hover:underline">
                          {c.phone}
                        </a>
                      )}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
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
          {acts.length === 0 ? (
            <Empty>No activity logged.</Empty>
          ) : (
            <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
              {acts.map((t) => (
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
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3">
                <dt className="text-[#8A928C]">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-[#EDEBE3] pt-2.5">
              <dt className="text-[#8A928C]">Phone</dt>
              <dd className="text-right">
                <PhoneDisplay value={a.phone} />
              </dd>
            </div>
          </dl>
        </Card>

        {links.length > 0 && (
          <Card>
            <div className="mb-2.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Channels</div>
            <ul className="flex flex-col gap-2">
              {links.map((l) => (
                <li key={l.icon}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[13px] text-[#3D4A44] transition-colors hover:text-[#14201B] hover:underline"
                  >
                    <Ico name={l.icon} size={14} />
                    <span className="truncate">{l.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

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
  );
}
