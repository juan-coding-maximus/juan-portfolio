"use client";

import { useMemo, useState, useTransition } from "react";
import { AttachmentButton, attachmentNote } from "./attachments-ui";
import type { MarketingFile } from "./dal";
import type { RecordTouchpointResult } from "./touchpoint";
import { recordOutreachSent } from "./outreach-actions";
import { draftOutreachMessage } from "./outreach-draft";
import { OUTREACH_TEMPLATES } from "./outreach-templates";
import { Card, Ico } from "./ui";

export type OutreachAccount = { id: string; name: string; phone: string | null; city: string | null };
export type OutreachContactLite = {
  id: string;
  account_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  phone: string;
};

/** Last-10-digit normalize + US country code, same rule as
 *  bridges/nutribiotic/match.py's norm_phone. Returns null rather than a
 *  guess when the number doesn't cleanly resolve to 10 digits, so a bad
 *  number never silently opens a chat with the wrong person. */
export function toWhatsAppPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return last10.length === 10 ? `1${last10}` : null;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function OutreachComposer({
  accounts,
  contacts,
  files,
}: {
  accounts: OutreachAccount[];
  contacts: OutreachContactLite[];
  files: MarketingFile[];
}) {
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [recipientKey, setRecipientKey] = useState<string | null>(null); // "account" or a contact id
  const [templateId, setTemplateId] = useState<string>("auto");
  const [message, setMessage] = useState("");
  const [basedOn, setBasedOn] = useState<{ detail: string; kind: string; at: string } | null>(null);
  const [needsAttachment, setNeedsAttachment] = useState(false);
  const [attachmentHint, setAttachmentHint] = useState<string | null>(null);
  const [attached, setAttached] = useState<MarketingFile[]>([]);
  const [draftPending, startDraft] = useTransition();
  const [opened, setOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RecordTouchpointResult | null>(null);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const accountContacts = useMemo(
    () => contacts.filter((c) => c.account_id === accountId),
    [contacts, accountId],
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return accounts.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [accounts, search]);

  function pickAccount(a: OutreachAccount) {
    setAccountId(a.id);
    setSearch(a.name);
    setRecipientKey(a.phone ? "account" : null);
    setOpened(false);
    setResult(null);
    setTemplateId("auto");
    setMessage("");
    setBasedOn(null);
    setNeedsAttachment(false);
    setAttachmentHint(null);
    setAttached([]);

    startDraft(async () => {
      const d = await draftOutreachMessage(a.id, a.name);
      setMessage(d.draft);
      setBasedOn(d.basedOn);
      setNeedsAttachment(d.needsAttachment);
      setAttachmentHint(d.attachmentHint);
    });
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = OUTREACH_TEMPLATES.find((x) => x.id === id);
    if (t && account) setMessage(t.body(account.name));
  }

  const recipientPhone =
    recipientKey === "account"
      ? account?.phone ?? null
      : accountContacts.find((c) => c.id === recipientKey)?.phone ?? null;
  const recipientLabel =
    recipientKey === "account"
      ? account?.name ?? ""
      : (() => {
          const c = accountContacts.find((x) => x.id === recipientKey);
          if (!c) return "";
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
          return name ? `${name} (${account?.name})` : account?.name ?? "";
        })();
  const waPhone = toWhatsAppPhone(recipientPhone);
  const finalMessage = message + attachmentNote(attached);

  function openWhatsApp() {
    if (!waPhone || !message.trim()) return;
    window.open(waLink(waPhone, finalMessage), "_blank", "noopener,noreferrer");
    setOpened(true);
    setResult(null);
  }

  function markSent() {
    if (!account || pending) return;
    startTransition(async () => {
      const res = await recordOutreachSent(account.id, recipientLabel, finalMessage);
      setResult(res);
      if (res.ok) setOpened(false);
    });
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
          <Ico name="whatsapp" size={13} />
          Who
        </div>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setAccountId(null);
            setRecipientKey(null);
          }}
          placeholder="Search an account by name..."
          className="w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2 text-[13.5px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
        />
        {matches.length > 0 && (
          <ul className="mt-1.5 divide-y divide-[#E2DFD5] rounded-md border border-[#E2DFD5]">
            {matches.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => pickAccount(a)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-[#FAF9F5]"
                >
                  <span>{a.name}</span>
                  <span className="text-[11.5px] text-[#8A928C]">{a.city ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {account && (
          <div className="mt-3 space-y-1.5">
            {account.phone && (
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="radio"
                  checked={recipientKey === "account"}
                  onChange={() => setRecipientKey("account")}
                />
                {account.name} (main line) · {account.phone}
              </label>
            )}
            {accountContacts.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="radio"
                  checked={recipientKey === c.id}
                  onChange={() => setRecipientKey(c.id)}
                />
                {[c.first_name, c.last_name].filter(Boolean).join(" ") || "(unnamed contact)"}
                {c.title ? ` · ${c.title}` : ""} · {c.phone}
              </label>
            ))}
            {!account.phone && accountContacts.length === 0 && (
              <p className="text-[12.5px] text-[#8A6D2F]">
                No phone on file for this account. Add one from the Clients screen first.
              </p>
            )}
            {recipientPhone && !waPhone && (
              <p className="text-[12.5px] text-[#8A6D2F]">
                &quot;{recipientPhone}&quot; doesn&apos;t resolve to a clean 10-digit number, fix it on file
                before sending.
              </p>
            )}
          </div>
        )}
      </Card>

      {account && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
              <Ico name="mail" size={13} />
              Message
            </div>
            {draftPending && <span className="text-[11.5px] text-[#8A928C]">Drafting from the last touchpoint...</span>}
          </div>

          {basedOn ? (
            <div className="mb-2 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2 text-[12px] leading-snug text-[#5B6560]">
              Continuing from the {basedOn.kind} logged {fmtWhen(basedOn.at)}: &quot;{basedOn.detail}&quot;
            </div>
          ) : (
            !draftPending && (
              <div className="mb-2 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2 text-[12px] leading-snug text-[#5B6560]">
                No prior touchpoint on file for this account, this reads as a first contact.
              </div>
            )
          )}

          {needsAttachment && attached.length === 0 && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2 text-[12.5px] leading-snug text-[#8A6D2F]">
              <Ico name="alert" size={13} />
              <span>
                The last touchpoint mentions {attachmentHint ?? "something to send over"}, use Attach below.
              </span>
            </div>
          )}

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Pick an account above to draft a message."
            className="w-full resize-none rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3 text-[13.5px] leading-relaxed text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
          />
          {attached.length > 0 && (
            <p className="mt-1 text-[11.5px] text-[#8A928C]">
              Will include: <span className="text-[#5B6560]">Attaching: {attached.map((f) => f.label).join(", ")}</span>
            </p>
          )}

          <div className="mt-2">
            <AttachmentButton files={files} selected={attached} onChange={setAttached} />
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-[11.5px] text-[#8A928C]">Use a generic template instead</summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {OUTREACH_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    templateId === t.id
                      ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                      : "border-[#E2DFD5] text-[#5B6560] hover:bg-[#FAF9F5]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </details>
        </Card>
      )}

      {account && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[46ch] text-[11.5px] leading-snug text-[#8A928C]">
              Opens WhatsApp Web/app with this text pre-filled in the chat. Nothing sends until you press send
              there yourself. Any attachment you picked above already downloaded, drag it into the chat.
            </p>
            <button
              onClick={openWhatsApp}
              disabled={!waPhone || !message.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#25D366] px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Ico name="whatsapp" size={13} />
              Open in WhatsApp
            </button>
          </div>

          {opened && !result && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2.5">
              <p className="text-[13px] text-[#3D4A44]">Sent it in WhatsApp? File it to the OS and HubSpot queue.</p>
              <button
                onClick={markSent}
                disabled={pending}
                className="shrink-0 rounded-md border border-[#14201B] px-3 py-1.5 text-[12.5px] font-medium text-[#14201B] transition-colors hover:bg-white disabled:opacity-40"
              >
                {pending ? "Filing..." : "Mark as sent"}
              </button>
            </div>
          )}

          {result && (
            <div
              className={`mt-3 rounded-md border px-3 py-2.5 text-[13px] leading-relaxed ${
                result.ok
                  ? "border-[#E2DFD5] bg-[#FAF9F5] text-[#3D4A44]"
                  : "border-[#E5D9BF] bg-[#FBF6E9] text-[#8A6D2F]"
              }`}
            >
              {result.ok ? (
                result.needsAccount ? (
                  <>Logged, but couldn&apos;t confidently match an account.</>
                ) : (
                  <>
                    Filed to <span className="font-medium">{result.accountName}</span>. HubSpot Note is queued
                    for the next dry-run-then-write pass, same gate as clientos.
                  </>
                )
              ) : (
                result.error
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
