"use client";

/**
 * The account profile body. Pure presentation, no data fetching, so it renders
 * identically whether it lands on the standalone /account/[id] page (deep
 * link, direct visit) or inside the pop-up modal every list link opens by
 * default (see modal.tsx). One shape, two hosts.
 *
 * "use client" only because it reads the route context for the Add to route
 * button; the standalone page is a Server Component, which can still render
 * this as a client child.
 */

import { useState, useTransition } from "react";
import type { Account, Activity, Contact, PurchaseLine, PurchaseOrder, Tier } from "./dal";
import { setPotentialJuan } from "./account-actions";
import { useRoute } from "./route-context";
import {
  Card,
  Empty,
  HUBSPOT_COMPANY_URL,
  Ico,
  PhoneDisplay,
  TierChip,
  absoluteUrl,
  daysAgo,
  money,
  prettyPhone,
  prettyUrl,
} from "./ui";

const POTENTIAL_LETTERS: Tier[] = ["A", "B", "C", "D", "E", "F", "G"];

/**
 * HQ's grade beside Juan's own read, same two-scale rule as TierChip
 * (ui.tsx): never a bare letter, always which scale it came from. HQ's is
 * read-only here on purpose, the mirror stays pull-only (0021); Juan's is a
 * toggle, PATCHed straight to nb_accounts.potential_juan and never synced
 * out (0039). Tapping the active letter clears it back to "defer to HQ."
 */
function PotentialGrade({
  accountId,
  hq,
  juan,
}: {
  accountId: string;
  hq: string | null;
  juan: Tier | null;
}) {
  const [value, setValue] = useState<Tier | null>(juan);
  const [pending, startTransition] = useTransition();
  const hqLetter = hq ? hq.split(" ")[0] || null : null;

  return (
    <Card>
      <div className="mb-2.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Potential</div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-[#5B6560]">HQ grade</span>
        {hqLetter ? <TierChip tier={hqLetter} scale="hq" /> : <span className="text-[#A9AFA9]">unknown</span>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[13px] text-[#5B6560]">Your read</span>
        <div className="flex gap-1">
          {POTENTIAL_LETTERS.map((t) => {
            const active = value === t;
            return (
              <button
                key={t}
                type="button"
                disabled={pending}
                aria-pressed={active}
                onClick={() => {
                  const next = active ? null : t;
                  setValue(next);
                  startTransition(() => {
                    void setPotentialJuan(accountId, next);
                  });
                }}
                className={`h-6 w-6 rounded text-[11.5px] font-semibold transition-colors ${
                  active
                    ? "bg-[#14201B] text-[#F7F6F1]"
                    : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      {value && (
        <p className="mt-2 text-[11.5px] text-[#8A928C]">Stays local. Never pushed to HubSpot.</p>
      )}
    </Card>
  );
}

// Website is NOT here: it graduated to the action row at the top of the profile
// (2026-08-05) and listing it twice would make the same link look like two.
const SOCIAL_LINKS = (a: Account) =>
  [
    a.email && { href: `mailto:${a.email}`, label: a.email, icon: "mail" as const },
    a.instagram_url && { href: a.instagram_url, label: "Instagram", icon: "instagram" as const },
    a.facebook_url && { href: a.facebook_url, label: "Facebook", icon: "facebook" as const },
    a.linkedin_url && { href: a.linkedin_url, label: "LinkedIn", icon: "linkedin" as const },
  ].filter(Boolean) as { href: string; label: string; icon: "mail" | "instagram" | "facebook" | "linkedin" }[];

export function AccountDetailBody({
  account: a,
  activities: acts,
  contacts,
  orders = [],
  lines = [],
}: {
  account: Account;
  activities: Activity[];
  contacts: Contact[];
  orders?: PurchaseOrder[];
  lines?: PurchaseLine[];
}) {
  const gap = a.current_state || a.future_state || a.impact;
  const links = SOCIAL_LINKS(a);
  const { addToRoute, inRoute } = useRoute();
  const onRoute = inRoute.has(a.id);

  return (
    <div className="flex flex-col gap-5">
      {/* THE THREE OUTSIDE HANDLES, ABOVE EVERYTHING. Juan, 2026-08-05: the
          HubSpot record was reachable only from a map pin's card, so opening an
          account from a list meant closing the profile again to get to the
          portal. Website and phone sat in the right column, which is the last
          thing read on a laptop and the last thing scrolled to on a phone. All
          three are actions, not attributes, so they lead. The full number stays
          in the sidebar too: this row is for tapping, that one is for reading
          aloud. Absent ones render as muted, unclickable text rather than
          vanishing, so "we never found a site" is visible as a gap to fill. */}
      <div className="flex flex-wrap items-center gap-2">
        {a.hubspot_company_id ? (
          <a
            href={HUBSPOT_COMPANY_URL(a.hubspot_company_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#2C6A46] px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Ico name="external" size={13} />
            Open in HubSpot
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#E2DFD5] px-3.5 py-2 text-[13px] text-[#A9AFA9]">
            <Ico name="external" size={13} />
            No HubSpot record
          </span>
        )}

        {a.website ? (
          <a
            href={absoluteUrl(a.website)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] hover:text-[#14201B]"
          >
            <Ico name="globe" size={13} />
            <span className="max-w-[26ch] truncate">{prettyUrl(a.website)}</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#E2DFD5] px-3.5 py-2 text-[13px] text-[#A9AFA9]">
            <Ico name="globe" size={13} />
            No site on file
          </span>
        )}

        {a.phone ? (
          <a
            href={`tel:${a.phone}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3.5 py-2 text-[13px] font-medium tabular-nums text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] hover:text-[#14201B]"
          >
            <Ico name="phone" size={13} />
            {prettyPhone(a.phone)}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#E2DFD5] px-3.5 py-2 text-[13px] text-[#A9AFA9]">
            <Ico name="phone" size={13} />
            No phone on file
          </span>
        )}

        {/* Add to route, same action and same one-tap rule as a pin's card on
            the map (see RoutePanel.tsx / AccountsMap.tsx): once it is on the
            route, tapping again can only be a mis-tap, so it goes inert rather
            than staying live. Removing is the route panel's job. */}
        <button
          type="button"
          onClick={() => addToRoute(a.id)}
          disabled={onRoute}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-opacity ${
            onRoute
              ? "cursor-default bg-[#EEECE3] text-[#5B6560]"
              : "bg-[#2C6A46] text-white hover:opacity-90"
          }`}
        >
          <Ico name={onRoute ? "check" : "route"} size={13} />
          {onRoute ? "On the route" : "Add to route"}
        </button>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-5">
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
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                return (
                  <li key={c.id} className="flex flex-col gap-0.5 text-[13.5px]">
                    <div className="flex items-baseline gap-2">
                      {name && <span className="font-medium">{name}</span>}
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

        {/* Gap Selling. Diagnosis before pitch. Renders only once discovery has
            actually captured something, same rule as every other optional
            card below: a field nobody has filled in is absent, not explained. */}
        {gap && (
          <Card>
            <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
              The gap
            </div>
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
          </Card>
        )}

        {/* Purchases. Every item this account has ever ordered, summed to net
            units across the full order history and ranked most-to-least, for
            the 146 of 459 accounts with loaded order history; absent entirely
            otherwise (see listPurchases in dal.ts), same honesty rule as
            every other card here: no orders on file is silence, not a zero.
            Summing net (not gross) matters: a credit line has negative qty,
            and a return should pull an item's rank down, not inflate it. */}
        {orders.length > 0 && (() => {
          const totals = new Map<string, { qty: number; revenueCents: number }>();
          for (const l of lines) {
            const name = l.product_name ?? "Item";
            const prev = totals.get(name) ?? { qty: 0, revenueCents: 0 };
            totals.set(name, {
              qty: prev.qty + (l.qty ?? 0),
              revenueCents: prev.revenueCents + l.line_revenue_cents,
            });
          }
          const items = [...totals.entries()]
            .filter(([, t]) => t.qty !== 0)
            .sort((a, b) => b[1].qty - a[1].qty);

          return (
            <Card>
              <div className="mb-3 flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                <span>Purchases</span>
                <span className="normal-case tracking-normal">
                  {orders.length} order{orders.length === 1 ? "" : "s"} · most units first
                </span>
              </div>
              <ul className="flex flex-col divide-y divide-[#EDEBE3]">
                {items.map(([name, t]) => (
                  <li key={name} className="flex items-baseline justify-between gap-3 py-1.5 text-[13.5px]">
                    <span className="min-w-0 truncate">{name}</span>
                    <span className="shrink-0 tabular-nums text-[#5B6560]">
                      ×{t.qty} <span className="text-[#8A928C]">· {money(t.revenueCents / 100)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })()}

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

      <aside className="flex min-w-0 flex-col gap-4">
        <PotentialGrade accountId={a.id} hq={a.potential_hq} juan={a.potential_juan} />

        <Card>
          {/* Two stat tiles per row on a phone, label stacked over value, both
              hard-truncated: a squeezed sidebar row that can't fit its value
              used to overflow the whole page sideways with body's dark bg
              bleeding through and the value scrolled out of view entirely,
              silent because of the site-wide overflow-x:hidden safety net.
              Truncating instead of wrapping keeps every tile one line at any
              width, since these values (a state word, "8mo ago", a dollar
              amount, a date) are always short. Reverts to the original
              compact single-column list once there is real sidebar width. */}
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-[13.5px] lg:flex lg:flex-col lg:gap-2.5">
            {[
              ["State", a.lifecycle || "unknown"],
              ["Last order", a.last_order_at ? daysAgo(a.last_order_at) : "never"],
              ["Lifetime", money(a.lifetime_revenue)],
              ["Trailing 12mo", money(a.trailing_12m_revenue)],
              ["Reorder due", a.expected_reorder_at ?? "not set"],
            ].map(([k, v]) => (
              <div
                key={k as string}
                className="flex min-w-0 flex-col gap-1 lg:flex-row lg:items-baseline lg:justify-between lg:gap-3"
              >
                <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C] lg:text-[13.5px] lg:normal-case lg:tracking-normal">
                  {k}
                </dt>
                <dd className="truncate text-[15px] font-semibold text-[#14201B] lg:text-right lg:text-[13.5px] lg:font-normal">
                  {v}
                </dd>
              </div>
            ))}
            {a.phone && (
              <div className="col-span-2 flex items-center justify-between gap-3 border-t border-[#EDEBE3] pt-4 lg:col-span-1 lg:pt-2.5">
                <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C] lg:text-[13.5px] lg:normal-case lg:tracking-normal">
                  Phone
                </dt>
                <dd className="min-w-0">
                  <PhoneDisplay value={a.phone} />
                </dd>
              </div>
            )}
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
                  <dt className="w-9 shrink-0 text-[#8A928C] capitalize">{day}</dt>
                  <dd className="min-w-0 flex-1 text-right break-words tabular-nums">
                    {ranges.length ? ranges.map((r) => r.join(" to ")).join(", ") : "closed"}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </aside>
      </div>
    </div>
  );
}
