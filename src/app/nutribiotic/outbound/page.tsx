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
  listOwnerContactNames,
  listOwnerContactPhones,
  isConfigured,
} from "../lib/dal";
import { ManualEmailComposer } from "../lib/manual-email-ui";
import { DraftQueue, QuickReach, type DraftRow } from "../lib/outbound-ui";
import { OutreachComposer } from "../lib/outreach-ui";
import { PriorityPanel } from "../lib/priority-ui";
import { Card, Empty, PageHead } from "../lib/ui";

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
  const [res, accountsResult, contacts, contactNames, files, priority] = await Promise.all([
    listDrafts(),
    listOwnerAccounts(),
    listOwnerContactPhones(),
    listOwnerContactNames(),
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
   * FIT NUMBER LEADS (Juan, 2026-09-16, replacing the prior urgency-first
   * order below). A draft he pulls to the top of its account's fit score has
   * to actually render at the top of this list, not sit under every
   * "needs a reply today"/"soon" tag from an unrelated thread. Urgency is
   * only the tiebreaker inside the same fit score now, not the other way
   * around. An unscored account (-1) sorts after every graded one, same as
   * an ungraded urgency: not scored is not zero.
   *
   * (Previously: urgency led and fit only broke ties inside a tier, on the
   * reasoning that what a conversation said outranks a history-derived
   * score. Juan overrode that after a fit-100 draft for NHC/Letty stayed
   * buried under ungraded-urgency older threads.)
   */
  const ordered = [...res.data].sort((a, b) => {
    const pa = a.account_id ? (priority.byId.get(a.account_id)?.score ?? -1) : -1;
    const pb = b.account_id ? (priority.byId.get(b.account_id)?.score ?? -1) : -1;
    if (pa !== pb) return pb - pa;
    const ua = typeof a.urgency === "number" ? a.urgency : -1;
    const ub = typeof b.urgency === "number" ? b.urgency : -1;
    return ub - ua;
  });
  const drafts = accountFilter ? ordered.filter((d) => d.account_id === accountFilter) : ordered;

  // account -> best phone on file (the account's own line, else the first
  // named contact's cell), used so every draft card can offer WhatsApp
  // regardless of what channel it was originally generated as.
  const phoneByAccount = new Map<string, string>();
  for (const a of accounts) if (a.phone) phoneByAccount.set(a.id, a.phone);
  for (const c of contacts) if (c.phone && !phoneByAccount.has(c.account_id)) phoneByAccount.set(c.account_id, c.phone);

  // account -> every named contact on file (phone or not), so a draft card
  // shows who we actually know at that account, not just who we can text.
  const contactNamesByAccount = new Map<string, string[]>();
  for (const c of contactNames) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    if (!name) continue;
    const list = contactNamesByAccount.get(c.account_id) ?? [];
    list.push(name);
    contactNamesByAccount.set(c.account_id, list);
  }

  /* Everything each card prints, resolved here and handed down as plain data.
     The list itself is a client component now (DraftQueue), because a draft
     Juan has marked sent or dismissed has to LEAVE the queue rather than sit in
     it wearing a confirmation (Juan, 2026-09-17). The order above is untouched:
     this maps `drafts` in place. */
  const rows: DraftRow[] = drafts.map((d) => ({
    draft: d,
    phone: d.account_id ? (phoneByAccount.get(d.account_id) ?? null) : null,
    contactNames: d.account_id ? (contactNamesByAccount.get(d.account_id) ?? []) : [],
    accountName: d.account_id ? (accounts.find((a) => a.id === d.account_id)?.name ?? null) : null,
    priority: d.account_id ? (priority.byId.get(d.account_id) ?? null) : null,
  }));

  return (
    <>
      <PageHead title="Outbound" />

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
      {!accountFilter && <PriorityPanel book={priority} limit={6} />}

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
        <DraftQueue
          rows={rows}
          files={files}
          synthetic={synthetic}
          emptyMessage={
            accountFilter ? "Nothing queued for this account right now." : "No drafts waiting on you."
          }
        />
      )}
    </>
  );
}
