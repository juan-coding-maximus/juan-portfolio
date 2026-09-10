"use client";

/**
 * What shows under a capture that parked at needs_next_step (Visit tab): the
 * account is already known, the note just never said what happens with it
 * next. Nothing files to HubSpot until Juan answers this, one line or the
 * explicit "None needed" tap, because a filed Note with no next step is
 * exactly the gap this exists to close (Juan, 2026-09-10).
 *
 * Same one-tap-confirm-always-a-success-note shape as AccountMatchResolver
 * (new-account-ui.tsx): a tap that changes real data is not trustworthy
 * unless it visibly says so.
 */

import { useEffect, useState, useTransition } from "react";
import type { Touchpoint } from "./dal";
import { resolveTouchpointNextStep, type ResolveResult } from "./touchpoint";
import { Ico, SuccessNote } from "./ui";

export function NextStepResolver({
  touchpointId,
  accountName,
  onResolved,
}: {
  touchpointId: string;
  accountName: string | null;
  onResolved?: () => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Same tap-to-skip-or-auto-clear pattern as every other resolved note on
  // this screen (touchpoint-ui.tsx's `success`, new-account-ui.tsx's
  // matchResult/created): read it, or wait, either way it clears itself.
  useEffect(() => {
    if (!result?.ok) return;
    const t = setTimeout(() => onResolved?.(), 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function submit(value: string) {
    if (pending || !value.trim()) return;
    startTransition(async () => {
      setResult(await resolveTouchpointNextStep(touchpointId, value));
    });
  }

  if (result?.ok) {
    return (
      <div className="mt-3">
        <button onClick={() => onResolved?.()} className="block w-full text-left">
          <SuccessNote
            title={`Logged${accountName ? `: ${accountName}` : ""}`}
            detail={result.summary}
            hubspotFiled={result.hubspotFiled}
            hubspotId={result.hubspotNoteId}
            hubspotError={result.hubspotError}
            meta={
              <div className="mt-1.5 text-[11px] uppercase tracking-[0.1em] text-[#A9AFA9]">Tap for the next one</div>
            }
          />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A6D2F]">
        <Ico name="alert" size={11} />
        What&apos;s the next step{accountName ? ` for ${accountName}` : ""}?
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Call back Thursday about the reorder"
        rows={2}
        autoFocus
        className="w-full resize-none rounded-md border border-[#E2DFD5] bg-white p-2 text-[14px] leading-relaxed text-[#14201B] placeholder:text-[#A9AFA9] focus:outline-none"
      />
      {result && !result.ok && <div className="text-[12px] text-[#8A6D2F]">{result.error}</div>}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => submit("No follow-up needed.")}
          disabled={pending}
          className="rounded-md border border-[#E2DFD5] px-2.5 py-1.5 text-[12px] text-[#5B6560] transition-colors hover:bg-white disabled:opacity-40"
        >
          None needed
        </button>
        <button
          type="button"
          onClick={() => submit(text)}
          disabled={pending || !text.trim()}
          className="rounded-md bg-[#14201B] px-3 py-1.5 text-[12.5px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

type QueuePayload = {
  ok: boolean;
  pendingNextSteps?: Touchpoint[];
  accountNames?: Record<string, string>;
};

/**
 * A voice-recorded visit resolves async, after transcription, on nobody's
 * screen (the same gap listPendingAccountMatches/unmatched-ui.tsx exist for,
 * 2026-08-19). A parked needs_next_step row has the exact same invisibility
 * risk: without this, the note sits filed nowhere until someone opens Claude
 * Code and asks for it by hand. Lives on Clients, next to "Needs a match",
 * same fetch-after-render shape (api/visit-queues/route.ts) and the same
 * choice not to auto-hide a resolved row: this is desk work, read once.
 */
export function PendingNextSteps() {
  const [data, setData] = useState<QueuePayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);

    fetch("/nutribiotic/api/visit-queues", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        if (r.redirected) {
          window.location.reload();
          return Promise.reject(new Error("gated"));
        }
        return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
      })
      .then((json: QueuePayload) => (json.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true))
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  if (failed) {
    return (
      <div className="mb-8 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[13px] text-[#8A6D2F]">
        Couldn&rsquo;t load the notes waiting on a next step.
      </div>
    );
  }

  const rows = data?.pendingNextSteps ?? [];
  const accountNames = data?.accountNames ?? {};
  if (rows.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
        Needs a next step · {rows.length}
      </h2>
      <div className="flex flex-col gap-4">
        {rows.map((tp) => (
          <div key={tp.id} className="rounded-xl border border-[#E2DFD5] bg-white p-4">
            <p className="line-clamp-3 text-[13px] leading-relaxed text-[#3D4A44]">{tp.raw_text}</p>
            <NextStepResolver
              touchpointId={tp.id}
              accountName={tp.account_id ? accountNames[tp.account_id] ?? null : null}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
