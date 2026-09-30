"use client";

import { useState, useTransition } from "react";
import { retryHubspotFiling } from "./touchpoint";

/**
 * One tap to carry a logged note across to HubSpot again, right where the
 * failure was shown. There is no retry queue anywhere (Juan, 2026-09-30):
 * a HubSpot miss is said out loud on the note that missed, and fixed there.
 */
export function HubspotRetry({ activityId }: { activityId: number | null }) {
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  if (!activityId) return null;
  if (outcome?.ok) {
    return <span className="text-[12px] text-[#2C6A46]">{outcome.text}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          start(async () => {
            try {
              const r = await retryHubspotFiling(activityId);
              setOutcome(
                r.hubspotFiled
                  ? { ok: true, text: `Filed to HubSpot${r.hubspotNoteId ? ` (${r.hubspotNoteId})` : ""}.` }
                  : { ok: false, text: r.hubspotError ?? "HubSpot said no again." },
              );
            } catch (err) {
              setOutcome({ ok: false, text: err instanceof Error ? err.message : String(err) });
            }
          });
        }}
        disabled={pending}
        className="rounded-md bg-[#14201B] px-2.5 py-1 text-[12px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Retrying…" : "Retry HubSpot"}
      </button>
      {outcome && !outcome.ok && <span className="text-[12px] text-[#8A2E2E]">{outcome.text}</span>}
    </span>
  );
}
