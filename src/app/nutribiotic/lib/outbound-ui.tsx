"use client";

import { useState } from "react";
import { AttachmentButton, attachmentNote } from "./attachments-ui";
import type { Draft, MarketingFile } from "./dal";
import { AccountLink } from "./modal";
import { decideDraft, type DraftSentResult } from "./outbound-actions";
import { imessageLink, toWhatsAppPhone, waLink } from "./outreach-ui";
import { PriorityChip } from "./priority-ui";
import type { PriorityResult } from "./priority";
import { DoneSection, ResolvingRow, useDoneLog } from "./queue-ui";
import { Card, Empty, Ico, SuccessNote, daysAgo } from "./ui";

/**
 * The three ways to say one short thing to one account, when the queue has
 * nothing for them. Juan's ask, 2026-09-08: the scoped Outbound view used to
 * end in "Nothing queued for this account right now", which is true and
 * useless, and the thing he actually wanted from that screen was to send a
 * quick note.
 *
 * NOTHING HERE SENDS, same as every other button on this page. Each is a deep
 * link that opens the app Juan sends from with the message pre-filled: an
 * Outlook Web compose link into his mailbox (same deep link as DraftActions'
 * "Open in Outlook"), sms: into Messages, wa.me into WhatsApp. The OS cannot
 * see whether he pressed send on any of them, and does not claim to.
 *
 * A CHANNEL WITH NOTHING ON FILE DOES NOT RENDER. No greyed button, no
 * placeholder address: an account with no email simply has two buttons. That
 * is the same rule Fact and PriorityChip follow, and the reason is the same,
 * a control that cannot work is worse than an absence, because it reads as a
 * capability.
 */
export function QuickReach({
  reach,
}: {
  reach: { name: string; email: string | null; phone: string | null; contactFirstName: string | null };
}) {
  // The greeting uses the contact's first name when one is on file and the
  // business name when one is not. Never "there", never a blank: both are
  // things nobody said (HARD RULE 1).
  const greetName = reach.contactFirstName ?? reach.name;
  const body = `Hi ${greetName},\n\nThank you,\nJuan`;
  const wa = toWhatsAppPhone(reach.phone);
  const outlook = reach.email ? owaComposeLink(reach.email, reach.name, body) : null;

  const cls =
    "flex items-center gap-1.5 rounded-md border border-[#D8D4C8] px-3 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]";

  return (
    <div className="rounded-lg border border-[#E2DFD5] bg-white p-4">
      <p className="text-[13.5px] leading-relaxed text-[#5B6560]">
        Nothing is queued for {reach.name}. Open a short note to them instead, pre-filled and ready to send from your
        own account.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {outlook && (
          <a href={outlook.href} target="_blank" rel="noopener noreferrer" className={cls}>
            <Ico name="mail" size={13} />
            Email
          </a>
        )}
        {wa && (
          <a href={imessageLink(wa, body)} target="_blank" rel="noopener noreferrer" className={cls}>
            <Ico name="imessage" size={13} />
            iMessage
          </a>
        )}
        {wa && (
          <a href={waLink(wa, body)} target="_blank" rel="noopener noreferrer" className={cls}>
            <Ico name="whatsapp" size={13} />
            WhatsApp
          </a>
        )}
      </div>
      {/* Both of these are findings, not failures, and they name the fix. */}
      {!reach.email && !wa && (
        <p className="mt-3 text-[12.5px] text-[#8A928C]">
          No email and no usable phone on file for this account yet.
        </p>
      )}
      {(!reach.email || !wa) && (reach.email || wa) && (
        <p className="mt-3 text-[12.5px] text-[#8A928C]">
          {!reach.email ? "No email on file yet." : "No usable phone on file yet."}
        </p>
      )}
    </div>
  );
}

/** One draft, with everything the card prints already resolved server side.
 *  Plain data only: this crosses into a client component. */
export type DraftRow = {
  draft: Draft;
  /** Best phone on file for the account (its own line, else a named contact's
   *  cell), so any draft can offer WhatsApp regardless of how it was made. */
  phone: string | null;
  /** Who we actually know at that account, printed on the card. */
  contactNames: string[];
  accountName: string | null;
  priority: PriorityResult | null;
};

/**
 * The "Waiting on you" list, client-owned so a handled draft can leave it.
 *
 * ORDER IS THE SERVER'S, UNTOUCHED. outbound/page.tsx ranks by fit score with
 * urgency as the tiebreak (Juan, 2026-09-16, after a fit-100 draft stayed
 * buried under older ungraded-urgency threads). This component only decides
 * which rows are still open, never where they sit.
 */
export function DraftQueue({
  rows,
  files,
  synthetic,
  emptyMessage,
}: {
  rows: DraftRow[];
  files: MarketingFile[];
  synthetic: boolean;
  emptyMessage: string;
}) {
  // Which rows have finished leaving. Resolution state itself lives in the
  // card, so a row that errors is untouched here and stays put.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Record<string, "Sent" | "Dismissed">>({});
  const { done, log } = useDoneLog();

  const open = rows.filter((r) => !gone.has(r.draft.id));

  return (
    <>
      {open.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((row) => (
            <li key={row.draft.id}>
              <ResolvingRow
                resolved={Boolean(resolved[row.draft.id])}
                onGone={() => {
                  const outcome = resolved[row.draft.id];
                  setGone((prev) => new Set(prev).add(row.draft.id));
                  if (outcome) {
                    log({
                      id: row.draft.id,
                      label: row.accountName ?? row.draft.subject ?? "Draft",
                      outcome,
                    });
                  }
                }}
              >
                <DraftCard
                  row={row}
                  files={files}
                  synthetic={synthetic}
                  onResolved={(outcome) => setResolved((prev) => ({ ...prev, [row.draft.id]: outcome }))}
                />
              </ResolvingRow>
            </li>
          ))}
        </ul>
      )}
      <DoneSection entries={done} />
    </>
  );
}

function DraftCard({
  row,
  files,
  synthetic,
  onResolved,
}: {
  row: DraftRow;
  files: MarketingFile[];
  synthetic: boolean;
  onResolved: (outcome: "Sent" | "Dismissed") => void;
}) {
  const d = row.draft;
  return (
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
        {row.contactNames.length > 0 && (
          <span className="text-[12px] text-[#8A928C]" title="Contacts on file for this account">
            {row.contactNames.join(", ")}
          </span>
        )}
        {d.account_id && (
          <AccountLink
            id={d.account_id}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#5B6560] hover:text-[#14201B]"
          >
            <Ico name="external" size={12} />
            Account
          </AccountLink>
        )}
        <span className="text-[12px] text-[#8A928C]">{daysAgo(d.created_at)}</span>
        {/* The reason the queue is in this order. Shown only for the two tiers
            that mean "do something", so the screen stays quiet, and carrying
            its own evidence in the tooltip: a priority with no stated reason is
            one nobody can correct. */}
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
        {/* The account's own priority, second to the urgency chip beside it and
            printed the same way: a number that carries its evidence sentence,
            never a bare grade. */}
        {d.account_id && <PriorityChip result={row.priority ?? undefined} compact />}
        {d.play_key && (
          <span
            className="rounded bg-[#ECEAE1] px-1.5 py-0.5 text-[11px] text-[#3D4A44]"
            title="Which play produced this draft. Recorded so reply rates can be compared by approach."
          >
            {d.play_key.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <p className="max-w-[76ch] text-[13.5px] leading-relaxed whitespace-pre-wrap text-[#3D4A44]">{d.body_md}</p>
      <DraftActions draft={d} phone={row.phone} files={files} synthetic={synthetic} onResolved={onResolved} />
    </Card>
  );
}

/**
 * Copy a draft body to the clipboard.
 *
 * Exists because an Outlook compose deep-link is a query string, and a long
 * body silently overruns what browsers and the endpoint will carry. When that
 * happens the link opens addressed and empty rather than looking fine and
 * arriving truncated, and this button is how the words get there.
 */
export function CopyBodyButton({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission refused. The body is on screen above either way,
      // so this degrades to selecting it by hand rather than to nothing.
      setCopied(false);
    }
  }

  return (
    <button
      onClick={copy}
      type="button"
      className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
    >
      {copied ? "Copied" : "Copy body"}
    </button>
  );
}

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
function owaQuery(params: Record<string, string>): string {
  // Not URLSearchParams: its toString() encodes spaces as "+" (form
  // encoding), and the Outlook deep-link endpoint shows that "+" literally
  // instead of decoding it back to a space. encodeURIComponent emits %20.
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export function owaComposeLink(
  toEmail: string,
  subject: string | null,
  body: string,
  bccEmail?: string | null,
): { href: string; bodyOmitted: boolean } {
  const base = "https://outlook.cloud.microsoft/mail/deeplink/compose?";
  const withBodyParams: Record<string, string> = { to: toEmail, body };
  if (subject) withBodyParams.subject = subject;
  if (bccEmail) withBodyParams.bcc = bccEmail;
  const full = base + owaQuery(withBodyParams);
  if (full.length <= COMPOSE_URL_LIMIT) return { href: full, bodyOmitted: false };

  const withoutBodyParams: Record<string, string> = { to: toEmail };
  if (subject) withoutBodyParams.subject = subject;
  if (bccEmail) withoutBodyParams.bcc = bccEmail;
  return { href: base + owaQuery(withoutBodyParams), bodyOmitted: true };
}

export type DraftLite = {
  id: string;
  account_id: string | null;
  channel: string;
  subject: string | null;
  body_md: string;
  to_email: string | null;
  /** Baked into the compose deep-link's bcc param (migration 0076). Order
   *  drafts set this to Juan's Gmail so order_email_capture.py sees a copy
   *  the moment he sends from Outlook -- Outlook itself hands nothing back
   *  to this OS on its own. Null for every other draft kind. */
  bcc_email?: string | null;
};

export type ChannelKind = "email" | "whatsapp" | "imessage";

const CHANNEL_TEXT: Record<ChannelKind, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  imessage: "iMessage",
};

/**
 * Channel badge at the top of a draft card. Green + filled only for a
 * PREFERRED channel actually on record (`preferred=true`, e.g. Mahsa at
 * Beverly Microblading asking for WhatsApp by name, 2026-08-29) — the same
 * green as the WhatsApp send button below, so the two read as one signal.
 * Anything else (no stated preference, just the drafted channel) stays the
 * quiet uppercase label this replaces, so a real preference stands out
 * rather than every card turning green.
 */
export function ChannelLabel({ channel, preferred }: { channel: ChannelKind; preferred: boolean }) {
  if (preferred) {
    return (
      <span
        className="rounded bg-[#25D366] px-1.5 py-0.5 text-[11px] font-medium text-white"
        title="This account asked for this channel by name."
      >
        {CHANNEL_TEXT[channel]}
      </span>
    );
  }
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">{CHANNEL_TEXT[channel] ?? channel}</span>
  );
}

/**
 * The action row for one draft card: attach, then whichever real channel(s)
 * are actually reachable for this account. The stored `channel` on the draft
 * (2026-08-13: Juan flagged a draft stamped "email" that should have been a
 * WhatsApp follow-up) is a hint about how the draft was generated, not a hard
 * gate on how it can be sent — Outlook shows whenever there's an email on
 * file, WhatsApp shows whenever a phone resolves, and both can be true at
 * once. "Mark sent" is one shared self-report either path can trigger; the OS
 * cannot verify a send either way, so it never pretends to.
 */
export function DraftActions({
  draft,
  phone,
  files,
  synthetic,
  onResolved,
}: {
  draft: DraftLite;
  phone: string | null;
  files: MarketingFile[];
  synthetic: boolean;
  /** Fires only on a write the server confirmed. The list above uses it to
   *  start this card's exit (lib/queue-ui.tsx): the confirmation below is a
   *  beat, not a resting state, and a handled draft does not belong in a queue
   *  of things waiting on you (Juan, 2026-09-17). An error never calls it. */
  onResolved?: (outcome: "Sent" | "Dismissed") => void;
}) {
  const [attached, setAttached] = useState<MarketingFile[]>([]);
  // Decided locally, not just server-revalidated: `decideDraft` used to be a
  // bare <form action={...}>, which gives zero on-screen feedback while it's
  // in flight and, if it throws, fails completely silently (Juan, 2026-08-14,
  // "dismiss and sent button dont work" — the writes were actually landing,
  // confirmed by two drafts that really did flip to dismissed, but nothing on
  // screen ever said so, so a click that worked and a click that did nothing
  // were indistinguishable and both read as broken). Driving it as a plain
  // async handler instead means every click gets a state: pending while the
  // request is in flight, then either a visible confirmation or a visible
  // error, never silence.
  const [pending, setPending] = useState<"sent" | "dismissed" | null>(null);
  const [decided, setDecided] = useState<"sent" | "dismissed" | null>(null);
  const [sentResult, setSentResult] = useState<DraftSentResult>(null);
  const [error, setError] = useState<string | null>(null);
  const waPhone = toWhatsAppPhone(phone);
  const finalBody = draft.body_md + attachmentNote(attached);
  const outlook = draft.to_email ? owaComposeLink(draft.to_email, draft.subject, finalBody, draft.bcc_email) : null;
  const hasPath = Boolean(draft.to_email || waPhone);

  async function decide(status: "sent" | "dismissed") {
    setPending(status);
    setError(null);
    try {
      const result = await decideDraft(
        draft.id,
        status,
        status === "sent"
          ? { accountId: draft.account_id, channel: draft.channel, subject: draft.subject, body: finalBody }
          : undefined,
      );
      setSentResult(result);
      setDecided(status);
      onResolved?.(status === "sent" ? "Sent" : "Dismissed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through, try again.");
    } finally {
      setPending(null);
    }
  }

  if (decided === "dismissed") {
    return (
      <div className="mt-3.5">
        <SuccessNote title="Dismissed" />
      </div>
    );
  }

  if (decided === "sent") {
    return (
      <div className="mt-3.5">
        {sentResult?.filed ? (
          <SuccessNote
            title={`Marked sent${sentResult.accountName ? `: ${sentResult.accountName}` : ""}`}
            hubspotFiled={sentResult.hubspotFiled}
            hubspotId={sentResult.hubspotNoteId}
            hubspotError={sentResult.hubspotError}
          />
        ) : (
          <SuccessNote
            title="Marked sent"
            detail="No account linked to this draft, so there was nowhere to file the note. Link it from the Clients screen and log it from there."
          />
        )}
      </div>
    );
  }

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2">
      {files.length > 0 && <AttachmentButton files={files} selected={attached} onChange={setAttached} />}
      {attached.length > 0 && (
        <span className="text-[12px] text-[#8A928C]">Attaching: {attached.map((f) => f.label).join(", ")}</span>
      )}

      {draft.to_email && !synthetic && outlook && (
        <>
          <a
            href={outlook.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-[#14201B] px-3 py-1.5 text-[13px] font-medium text-[#F7F6F1]"
          >
            Open in Outlook &rarr;
          </a>
          {outlook.bodyOmitted && (
            <>
              <CopyBodyButton body={finalBody} />
              <span className="text-[12px] text-[#8A6D2F]">
                Too long to prefill. Outlook opens addressed; paste the body in.
              </span>
            </>
          )}
        </>
      )}

      {waPhone && !synthetic && (
        <a
          href={waLink(waPhone, finalBody)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-[#25D366] px-3 py-1.5 text-[13px] font-medium text-white"
        >
          Open in WhatsApp
        </a>
      )}

      {waPhone && !synthetic && (
        <a
          href={imessageLink(waPhone, finalBody)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-[#14201B] px-3 py-1.5 text-[13px] font-medium text-[#F7F6F1]"
          title="Opens Messages addressed to this number. Sends from whichever number Messages is set to start new conversations from."
        >
          Open in Messages
        </a>
      )}

      {/* No email or phone on file: nothing to open a compose window against,
          but the draft is still real material -- Juan's ask, 2026-09-23, for
          an account whose only reachable door is the store's own website
          contact form. Copy stands in for the missing deep link; "Mark sent"
          below still works the same way it does on every other channel, on
          his word. */}
      {!hasPath && !synthetic && (
        <>
          <CopyBodyButton body={finalBody} />
          <span className="text-[12px] text-[#8A928C]">
            No email or phone on file &middot; paste into their site&rsquo;s contact form.
          </span>
        </>
      )}

      {!synthetic && (
        <button
          type="button"
          onClick={() => decide("sent")}
          disabled={pending !== null}
          className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44] disabled:opacity-50"
          title="Marks this sent on your word — the OS can't verify a send on any channel."
        >
          {pending === "sent" ? "Marking sent…" : "Mark sent"}
        </button>
      )}
      <button
        type="button"
        onClick={() => decide("dismissed")}
        disabled={pending !== null}
        className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44] disabled:opacity-50"
      >
        {pending === "dismissed" ? "Dismissing…" : "Dismiss"}
      </button>
      {error && <span className="text-[12px] text-[#B3452C]">{error}</span>}
    </div>
  );
}
