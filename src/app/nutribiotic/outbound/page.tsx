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

import {
  listDrafts,
  listMarketingFiles,
  listOwnerAccounts,
  listOwnerContactPhones,
  isConfigured,
} from "../lib/dal";
import { ManualEmailComposer } from "../lib/manual-email-ui";
import { DraftActions } from "../lib/outbound-ui";
import { OutreachComposer } from "../lib/outreach-ui";
import { Card, Empty, PageHead, daysAgo } from "../lib/ui";

export const dynamic = "force-dynamic";

export default async function Outbound() {
  const [res, accountsResult, contacts, files] = await Promise.all([
    listDrafts(),
    listOwnerAccounts(),
    listOwnerContactPhones(),
    listMarketingFiles(),
  ]);
  const synthetic = res.mode === "synthetic";
  const accounts = accountsResult.data
    .map((a) => ({ id: a.id, name: a.name, phone: a.phone, city: a.city }))
    .sort((a, b) => a.name.localeCompare(b.name));

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

      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Waiting on you</div>

      {accounts.length > 0 && (
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

      {res.data.length === 0 ? (
        <Empty>{!isConfigured() ? "No data source configured." : "No drafts waiting on you."}</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {res.data.map((d) => (
            <li key={d.id}>
              <Card>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">{d.channel}</span>
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
