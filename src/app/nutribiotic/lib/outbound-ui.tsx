"use client";

import { useState } from "react";
import { AttachmentButton, attachmentNote } from "./attachments-ui";
import type { MarketingFile } from "./dal";
import { decideDraft } from "./outbound-actions";
import { toWhatsAppPhone, waLink } from "./outreach-ui";

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
function owaComposeLink(toEmail: string, subject: string | null, body: string): { href: string; bodyOmitted: boolean } {
  const base = "https://outlook.cloud.microsoft/mail/deeplink/compose?";
  const withBody = new URLSearchParams({ to: toEmail, body });
  if (subject) withBody.set("subject", subject);
  const full = base + withBody;
  if (full.length <= COMPOSE_URL_LIMIT) return { href: full, bodyOmitted: false };

  const withoutBody = new URLSearchParams({ to: toEmail });
  if (subject) withoutBody.set("subject", subject);
  return { href: base + withoutBody, bodyOmitted: true };
}

export type DraftLite = {
  id: string;
  channel: string;
  subject: string | null;
  body_md: string;
  to_email: string | null;
};

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
}: {
  draft: DraftLite;
  phone: string | null;
  files: MarketingFile[];
  synthetic: boolean;
}) {
  const [attached, setAttached] = useState<MarketingFile[]>([]);
  const waPhone = toWhatsAppPhone(phone);
  const finalBody = draft.body_md + attachmentNote(attached);
  const outlook = draft.to_email ? owaComposeLink(draft.to_email, draft.subject, finalBody) : null;
  const hasPath = Boolean(draft.to_email || waPhone);

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

      {!hasPath && (
        <button
          type="button"
          disabled
          className="rounded-md bg-[#14201B] px-3 py-1.5 text-[13px] font-medium text-[#F7F6F1] opacity-35"
          title="No email or phone on file for this account — add one from the Clients screen."
        >
          Approve
        </button>
      )}

      {hasPath && !synthetic && (
        <form action={decideDraft.bind(null, draft.id, "sent")}>
          <button
            type="submit"
            className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44]"
            title="Marks this sent on your word — the OS can't verify a send on either channel."
          >
            Mark sent
          </button>
        </form>
      )}
      <form action={decideDraft.bind(null, draft.id, "dismissed")}>
        <button type="submit" className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44]">
          Dismiss
        </button>
      </form>
    </div>
  );
}
