/**
 * Outbound. Draft and send outreach, and the queue of drafts waiting on a
 * human.
 *
 * Agency principle 1: drafting may be automatic once trusted, SENDING never
 * is. Nothing on this screen sends anything itself: the WhatsApp composer
 * opens a wa.me deep link, the iMessage composer opens an sms: deep link into
 * Messages.app (2026-08-19, addressed only, cannot steer which of Juan's
 * numbers it sends FROM, that's Messages > Settings > iMessage on his Mac),
 * and the email queue's "Open in Outlook" opens a compose window he sends
 * from his own mailbox (which holds no Mail.Send scope, so a deep-link is
 * the only path that exists). "Mark sent" is a self-report either way; the
 * OS cannot verify a send on any channel.
 *
 * ONE TAB, ON PURPOSE (2026-08-13): the WhatsApp composer shipped as its own
 * /nutribiotic/outreach page first and Juan asked for it folded in here
 * instead, so "outbound" means one place for every outbound channel rather
 * than a page per channel. The stored `channel` on a draft is a hint about
 * how it was generated, not a hard gate on how it can be sent — a draft
 * stamped "email" still gets an Open in WhatsApp button the moment a phone
 * resolves for its account, because the generator's channel guess is
 * sometimes just wrong (Juan, 2026-08-13, on a Beverly Microblading Center
 * draft that should have been WhatsApp from the start). See
 * [[nutribiotic-whatsapp-bridge]].
 */

import Link from "next/link";
import {
  getPriorityBook,
  getQuickReach,
  listDrafts,
  listMarketingFiles,
  listOwnerAccounts,
  listOwnerContactPhones,
  isConfigured,
} from "../lib/dal";
import { ManualEmailComposer } from "../lib/manual-email-ui";
import { ChannelLabel, DraftActions, QuickReach, type ChannelKind } from "../lib/outbound-ui";
import { OutreachComposer } from "../lib/outreach-ui";
import { PriorityChip, PriorityPanel } from "../lib/priority-ui";
import { Card, Empty, PageHead, daysAgo } from "../lib/ui";

export const dynamic = "force-dynamic";

export default async function Outbound({
  searchParams,
}: {
  /* SDR's "View in Outbound" button, 2026-09-08: it opens this exact page in
     a new tab scoped to one account, so Juan sees what's already queued for
     whoever he just called before flagging anything new. A query param, not
     a separate route, because it's still the same one-queue screen the file
     header insists on, just pre-filtered. */
  searchParams: Promise<{ account?: string }>;
}) {
  const sp = await searchParams;
  const accountFilter = sp.account?.trim() || null;
  // Only fetched in the scoped view, and only to fill the three quick-action
  // buttons below. Null when the id is not in Juan's book, which is a real
  // scope answer and not an error state.
  const quickReach = accountFilter ? await getQuickReach(accountFilter) : null;
  const [res, accountsResult, contacts, files, priority] = await Promise.all([
    listDrafts(),
    listOwnerAccounts(),
    listOwnerContactPhones(),
    listMarketingFiles(),
    getPriorityBook(),
  ]);
  const synthetic = res.mode === "synthetic";
  /* Name and phone are what the picker needs; everything after `city` is what
     lib/outreach-templates.ts reads to decide which preloaded message is the
     timely one for this account and to ground what it says (fn_16cd3a). All of
     it is already on the row listOwnerAccounts returned, so nothing extra is
     queried and nothing is derived here. */
  const accounts = accountsResult.data
    .map((a) => ({
      id: a.id,
      name: a.name,
      phone: a.phone,
      city: a.city,
      channel: a.channel,
      tier: a.tier,
      lifecycle: a.lifecycle,
      last_order_at: a.last_order_at,
      expected_reorder_at: a.expected_reorder_at,
      expected_reorder_days: a.expected_reorder_days,
      top_category_12m: a.top_category_12m,
      top_category_lifetime: a.top_category_lifetime,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredAccount = accountFilter ? accounts.find((a) => a.id === accountFilter) : null;
  /*
   * URGENCY STILL LEADS. listDrafts() already returned the queue in urgency
   * order (2 · 1 · 0 · ungraded last, created_at desc inside a tier, migration
   * 0035). Account priority is layered UNDER that, never over it: what the
   * conversation said is a fact about this specific thread and outranks a
   * ranking computed from the account's history. So this only decides which of
   * two drafts in the SAME urgency tier Juan opens first, which is exactly the
   * tie the created_at fallback was resolving arbitrarily before. A draft on an
   * unscored account keeps its place rather than sinking, same rule as an
   * ungraded urgency: not scored is not zero.
   */
  const ordered = [...res.data].sort((a, b) => {
    const ua = typeof a.urgency === "number" ? a.urgency : -1;
    const ub = typeof b.urgency === "number" ? b.urgency : -1;
    if (ua !== ub) return ub - ua;
    const pa = a.account_id ? (priority.byId.get(a.account_id)?.score ?? -1) : -1;
    const pb = b.account_id ? (priority.byId.get(b.account_id)?.score ?? -1) : -1;
    return pb - pa;
  });
  const drafts = accountFilter ? ordered.filter((d) => d.account_id === accountFilter) : ordered;

  // account -> best phone on file (the account's own line, else the first
  // named contact's cell), used so every draft card can offer WhatsApp
  // regardless of what channel it was originally generated as.
  const phoneByAccount = new Map<string, string>();
  for (const a of accounts) if (a.phone) phoneByAccount.set(a.id, a.phone);
  for (const c of contacts) if (c.phone && !phoneByAccount.has(c.account_id)) phoneByAccount.set(c.account_id, c.phone);

  return (
    <>
      <PageHead
        title="Outbound"
        sub="Draft a WhatsApp or iMessage and open it pre-filled, or work through drafts waiting on you. Nothing on this screen sends anything."
      />

      {/* Scoped view from SDR's "View in Outbound" button: one account, what's
          already queued for them, nothing else on the screen to scan past. */}
      {accountFilter && (
        <div className="mb-5 flex items-center justify-between rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2">
          <span className="text-[13px] text-[#3D4A44]">
            Showing Outbound for <span className="font-medium">{filteredAccount?.name ?? "this account"}</span> only
          </span>
          <Link href="/nutribiotic/outbound" className="text-[12.5px] font-medium text-[#5B6560] hover:text-[#14201B]">
            Show all
          </Link>
        </div>
      )}

      {/* The same ranked list Map and SDR carry, so "what is worth my time" is
          answered wherever Juan already is instead of on a fourth screen. */}
      {!accountFilter && <PriorityPanel book={priority} surface="outbound" limit={6} />}

      {!accountFilter && (
        <div className="mb-6">
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">WhatsApp / iMessage</div>
          {accounts.length === 0 ? (
            <Card>
              <p className="text-[13px] text-[#8A928C]">No accounts loaded yet.</p>
            </Card>
          ) : (
            <OutreachComposer accounts={accounts} contacts={contacts} files={files} />
          )}
        </div>
      )}

      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Waiting on you</div>

      {!accountFilter && accounts.length > 0 && (
        <div className="mb-3">
          <ManualEmailComposer accounts={accounts} contacts={contacts} />
        </div>
      )}

      {synthetic && (
        <Card className="mb-5 border-l-[3px] border-l-[#E8A33D]">
          <p className="text-[13.5px] leading-relaxed text-[#5B6560]">
            These drafts are synthetic. They cannot be sent: every recipient address here uses a reserved domain
            that can never resolve, and this screen&apos;s own buttons stay disabled on a synthetic row.
          </p>
        </Card>
      )}

      {drafts.length === 0 ? (
        /* THE SCOPED VIEW IS NOT A DEAD END ANY MORE (Juan, 2026-09-08). An
           account with nothing queued is the normal case, and the answer to it
           is a message, not a sentence saying there is no message. Three plain
           deep links, each pre-filled and each opening the app that actually
           sends: nothing here sends anything itself, exactly as the file header
           insists. */
        accountFilter && quickReach ? (
          <QuickReach reach={quickReach} />
        ) : (
          <Empty>
            {!isConfigured()
              ? "No data source configured."
              : accountFilter
                ? "Nothing queued for this account right now."
                : "No drafts waiting on you."}
          </Empty>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((d) => (
            <li key={d.id}>
              <Card>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <ChannelLabel channel={d.preferred_channel ?? (d.channel as ChannelKind)} preferred={Boolean(d.preferred_channel)} />
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
                  {/* The account's own priority, second to the urgency chip
                      beside it and printed the same way: a number that carries
                      its evidence sentence, never a bare grade. */}
                  {d.account_id && <PriorityChip result={priority.byId.get(d.account_id)} compact />}
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
                <DraftActions
                  draft={d}
                  phone={d.account_id ? (phoneByAccount.get(d.account_id) ?? null) : null}
                  files={files}
                  synthetic={synthetic}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
