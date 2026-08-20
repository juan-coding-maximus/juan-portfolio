"use client";

/**
 * Log an email that already happened in Outlook, not through this screen's
 * own compose flow. Every other row here starts as a draft the queue
 * generated; this is the door for the other direction, an email Juan sent
 * (or got) on his own and wants the same HubSpot Email engagement filed for
 * it. Exact text in, exact text out: no LLM touches what gets pasted here,
 * same contract as decideDraft's "Mark sent" path (see outbound-actions.ts).
 */

import { useMemo, useState } from "react";
import type { DraftSentResult } from "./outbound-actions";
import { recordManualEmail } from "./outbound-actions";
import { Card, Ico, SuccessNote } from "./ui";

type Account = { id: string; name: string };
type ContactLite = { id: string; account_id: string; first_name: string | null; last_name: string | null; title: string | null };

const inputCls =
  "w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-2.5 py-1.5 text-[13px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none";
const primaryBtn =
  "rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40";
const ghostBtn =
  "rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]";

function contactLabel(c: ContactLite): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || c.title || "Unnamed contact";
}

export function ManualEmailComposer({ accounts, contacts }: { accounts: Account[]; contacts: ContactLite[] }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DraftSentResult>(null);
  const [error, setError] = useState<string | null>(null);

  const accountName = accounts.find((a) => a.id === accountId)?.name ?? null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || accountId) return [];
    return accounts.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [accounts, search, accountId]);
  const accountContacts = useMemo(
    () => contacts.filter((c) => c.account_id === accountId),
    [contacts, accountId],
  );

  function reset() {
    setDirection("outbound");
    setSearch("");
    setAccountId(null);
    setContactId(null);
    setSubject("");
    setBody("");
    setResult(null);
    setError(null);
  }

  async function submit() {
    if (!accountId || !body.trim()) return;
    setPending(true);
    setError(null);
    try {
      const r = await recordManualEmail({
        accountId,
        contactId,
        direction,
        subject: subject.trim() || null,
        body: body.trim(),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through, try again.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${ghostBtn} flex items-center gap-1.5`}>
        <Ico name="mail" size={13} />
        Log an email from Outlook
      </button>
    );
  }

  if (result) {
    return (
      <Card className="mb-3">
        <SuccessNote
          title={`Logged${result.accountName ? `: ${result.accountName}` : ""}`}
          hubspotFiled={result.hubspotFiled}
          hubspotId={result.hubspotNoteId}
          hubspotError={result.hubspotError}
        />
        <button type="button" onClick={() => { reset(); setOpen(false); }} className={`${ghostBtn} mt-3`}>
          Done
        </button>
      </Card>
    );
  }

  return (
    <Card className="mb-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
          <Ico name="mail" size={13} />
          Log an email from Outlook
        </div>
        <button type="button" onClick={() => { reset(); setOpen(false); }} className="text-[#8A928C] hover:text-[#8A2E2E]">
          <Ico name="close" size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          {(["outbound", "inbound"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium ${
                direction === d ? "bg-[#14201B] text-[#F7F6F1]" : "border border-[#D8D4C8] text-[#5B6560]"
              }`}
            >
              {d === "outbound" ? "I sent it" : "I received it"}
            </button>
          ))}
        </div>

        {!accountId ? (
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Which account?"
              className={inputCls}
            />
            {matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-[#E2DFD5] bg-white shadow-sm">
                {matches.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setAccountId(a.id); setSearch(a.name); }}
                    className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#FAF9F5]"
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-2.5 py-1.5 text-[13px]">
            <span className="font-medium">{accountName}</span>
            <button
              type="button"
              onClick={() => { setAccountId(null); setContactId(null); setSearch(""); }}
              className="text-[#8A928C] hover:text-[#8A2E2E]"
            >
              <Ico name="close" size={12} />
            </button>
          </div>
        )}

        {accountId && accountContacts.length > 0 && (
          <select
            value={contactId ?? ""}
            onChange={(e) => setContactId(e.target.value || null)}
            className={inputCls}
          >
            <option value="">No specific contact</option>
            {accountContacts.map((c) => (
              <option key={c.id} value={c.id}>{contactLabel(c)}</option>
            ))}
          </select>
        )}

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className={inputCls}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste or type exactly what the email said"
          rows={4}
          className={`${inputCls} resize-y`}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || !accountId || !body.trim()}
            onClick={submit}
            className={primaryBtn}
          >
            {pending ? "Logging…" : "Log to HubSpot"}
          </button>
          {error && <span className="text-[12px] text-[#B3452C]">{error}</span>}
        </div>
      </div>
    </Card>
  );
}
