"use client";

import { useEffect, useState } from "react";
import type { CalendarProposal, EngagementActivity, Touchpoint } from "./dal";
import { EngagementQueue } from "./engagement-ui";
import { AccountMatchResolver } from "./new-account-ui";
import { CalendarProposalRow } from "./touchpoint-ui";
import type { ParsedTouchpoint } from "./touchpoint";

type Payload = {
  ok: boolean;
  proposals?: CalendarProposal[];
  unfiled?: EngagementActivity[];
  pending?: Touchpoint[];
  accountNames?: Record<string, string>;
};

/**
 * The three queues, loaded AFTER the document has closed.
 *
 * See api/visit-queues/route.ts for why they are not part of the page render
 * any more: a streamed response stays open until its last Suspense boundary
 * resolves, and an open stream on a saturated phone connection is what iOS
 * reports as "This page couldn't load" even when every request logged 200.
 *
 * Nothing here can affect the capture box above it. It renders nothing while
 * loading (the queues sit below the box, so an absent placeholder moves
 * nothing), nothing when empty, and one quiet line when the fetch fails. There
 * is no retry loop: a queue is work that will still be there on the next
 * launch, and a phone in a parking lot should not be re-dialling in the
 * background while its owner is typing.
 */
export function VisitQueues() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    // Long enough for a slow cell connection, short enough that a hung request
    // does not sit open for the whole visit.
    const timer = setTimeout(() => ctrl.abort(), 20_000);

    fetch("/nutribiotic/api/visit-queues", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        // A lapsed session redirects to the gate. fetch follows it and hands
        // back HTML, which would otherwise surface as "couldn't load the
        // queues" while the real answer is "you need to unlock". Reload so
        // the gate takes over the whole screen, which is what it is for.
        if (r.redirected) {
          window.location.reload();
          return Promise.reject(new Error("gated"));
        }
        return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
      })
      .then((json: Payload) => (json.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true))
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  if (failed) {
    return (
      <div className="mx-auto w-full max-w-[600px] rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[13px] text-[#8A6D2F]">
        Couldn&rsquo;t load the follow-up queues. Logging a visit still works.
      </div>
    );
  }
  if (!data) return null;

  const pending = data.pending ?? [];
  const unfiled = data.unfiled ?? [];
  const proposals = data.proposals ?? [];
  const accountNames = data.accountNames ?? {};

  return (
    <>
      {pending.length > 0 && (
        <section className="mx-auto w-full max-w-[600px]">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Needs a match
          </h2>
          <div className="flex flex-col gap-4">
            {pending.map((tp) => {
              const parsed = tp.parsed as ParsedTouchpoint | null;
              const matchAccountId =
                parsed?.account_confidence === "low" && parsed.account_id ? parsed.account_id : null;
              return (
                <div key={tp.id} className="rounded-xl border border-[#E2DFD5] bg-white p-4">
                  <p className="line-clamp-3 text-[13px] leading-relaxed text-[#3D4A44]">{tp.raw_text}</p>
                  <AccountMatchResolver
                    touchpointId={tp.id}
                    nameGuess={parsed?.business_name_guess ?? null}
                    matchAccountId={matchAccountId}
                    matchAccountName={matchAccountId ? (accountNames[matchAccountId] ?? null) : null}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mx-auto w-full max-w-[600px]">
        <EngagementQueue activities={unfiled} />
      </div>

      {proposals.length > 0 && (
        <section className="mx-auto w-full max-w-[600px]">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Follow-ups to confirm
          </h2>
          <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
            {proposals.map((p) => (
              <CalendarProposalRow key={p.id} proposal={p} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
