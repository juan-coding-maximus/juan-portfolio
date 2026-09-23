"use client";

import { useEffect, useState } from "react";
import type { Touchpoint } from "./dal";
import { AccountMatchResolver } from "./new-account-ui";
import { ResolvingRow } from "./queue-ui";
import type { ParsedTouchpoint } from "./touchpoint";

type Payload = {
  ok: boolean;
  pending?: Touchpoint[];
  accountNames?: Record<string, string>;
};

/**
 * Notes that never landed on an account, worked from the desk.
 *
 * MOVED OFF VISIT 2026-08-27 (Juan). It was the tallest thing on the capture
 * screen and the least like the rest of it: filing what just happened takes
 * five seconds and one thumb, while deciding WHICH store a note belongs to
 * means reading Places candidates and comparing addresses. That is desk work,
 * and Clients is the desk screen.
 *
 * IT HAD TO LAND SOMEWHERE VISIBLE. An unmatched note is real field work
 * sitting unfiled, so removing the section without rehoming it would have been
 * data loss by neglect rather than a UI cleanup. Here it sits above the
 * account table, where the count is the first thing on the screen if there is
 * anything waiting, and the section is absent entirely when there is not.
 *
 * Same fetch-after-render shape as the Visit queues, for the same reason: no
 * server work on a screen may hold its response open. See
 * api/visit-queues/route.ts.
 */
/** One row of the queue: the note, the resolver, and the exit it takes once
 *  matched or discarded (lib/queue-ui.tsx), same shape as
 *  next-step-ui.tsx's PendingNextStepRow. Before this existed, a resolved or
 *  discarded row stayed on screen showing its own success note until the
 *  page reloaded, the exact "doesn't actually work" Juan hit tapping a
 *  duplicate match (2026-09-23): the write landed, nothing on screen said the
 *  queue had moved on. */
function UnmatchedRow({
  touchpointId,
  rawText,
  nameGuess,
  matchAccountId,
  matchAccountName,
  onGone,
}: {
  touchpointId: string;
  rawText: string;
  nameGuess: string | null;
  matchAccountId: string | null;
  matchAccountName: string | null;
  onGone: () => void;
}) {
  const [resolved, setResolved] = useState(false);
  return (
    <ResolvingRow resolved={resolved} onGone={onGone}>
      <div className="rounded-xl border border-[#E2DFD5] bg-white p-4">
        <p className="line-clamp-3 text-[13px] leading-relaxed text-[#3D4A44]">{rawText}</p>
        <AccountMatchResolver
          touchpointId={touchpointId}
          nameGuess={nameGuess}
          matchAccountId={matchAccountId}
          matchAccountName={matchAccountName}
          onSuccess={() => setResolved(true)}
          onDiscarded={onGone}
        />
      </div>
    </ResolvingRow>
  );
}

export function UnmatchedTouchpoints() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());

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
      <div className="mb-8 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[13px] text-[#8A6D2F]">
        Couldn&rsquo;t load the notes waiting on an account.
      </div>
    );
  }

  const pending = (data?.pending ?? []).filter((tp) => !gone.has(tp.id));
  const accountNames = data?.accountNames ?? {};
  if (pending.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
        Needs a match · {pending.length}
      </h2>
      <div className="flex flex-col gap-4">
        {pending.map((tp) => {
          const parsed = tp.parsed as ParsedTouchpoint | null;
          const matchAccountId =
            parsed?.account_confidence === "low" && parsed.account_id ? parsed.account_id : null;
          return (
            <UnmatchedRow
              key={tp.id}
              touchpointId={tp.id}
              rawText={tp.raw_text}
              nameGuess={parsed?.business_name_guess ?? null}
              matchAccountId={matchAccountId}
              matchAccountName={matchAccountId ? (accountNames[matchAccountId] ?? null) : null}
              onGone={() => setGone((prev) => new Set(prev).add(tp.id))}
            />
          );
        })}
      </div>
    </section>
  );
}
