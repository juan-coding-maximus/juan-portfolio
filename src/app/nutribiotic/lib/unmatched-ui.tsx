"use client";

import { useEffect, useState } from "react";
import type { Touchpoint } from "./dal";
import { AccountMatchResolver } from "./new-account-ui";
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
export function UnmatchedTouchpoints() {
  const [data, setData] = useState<Payload | null>(null);
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

  const pending = data?.pending ?? [];
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
  );
}
