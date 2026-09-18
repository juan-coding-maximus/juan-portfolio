"use client";

/**
 * A queue row that LEAVES once it is resolved.
 *
 * The standing rule was "every one-tap confirm ends in an inline SuccessNote"
 * (see ui.tsx's header). Juan refined it on 2026-09-17, looking at Outbound:
 * the note is right, but it must be a beat, not a resting state. He had pressed
 * Mark sent and Dismiss on four drafts and all four cards were still sitting
 * under "Waiting on you", full body text and all, saying "Dismissed." forever.
 * A queue of things waiting on you that keeps the things you already handled is
 * not a queue, it is a transcript.
 *
 * So: confirm in place, hold long enough to read (the HubSpot filing line is
 * real information, not decoration), then collapse and go. Where the screen is
 * a long working queue, what left lands in a quiet Done list at its foot, which
 * is the shape the SDR day rail already uses for a finished call (2026-09-16,
 * "make it go bottom of the list"). Where the queue is a short transient one, the
 * row simply goes.
 *
 * A FAILED ACTION NEVER LEAVES. Only a resolution the server confirmed starts
 * the timer; an error stays on screen, in place, until it is dealt with.
 *
 * This is a client module of its own rather than another export in ui.tsx
 * because ui.tsx is imported by server components (outbound/page.tsx and
 * friends) and a module holding useState cannot be in that graph.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Ico } from "./ui";

/** How long the confirmation holds before the row starts leaving. Long enough
 *  to read "Filed to HubSpot (520417432806)", short enough that it is a beat. */
const HOLD_MS = 1400;

/** The collapse itself. 240ms per the house timing scale for a small
 *  transition, on an exit ease so it accelerates away rather than lingering. */
const COLLAPSE_MS = 240;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Wraps one row of a queue. `resolved` flips true only when the write came
 * back successful; the row then holds its confirmation, collapses, and calls
 * `onGone` so the list that owns it can drop it.
 *
 * The confirmation itself is rendered by the row's own children, in the place
 * the tap happened, exactly as before. This component owns only the leaving.
 */
export function ResolvingRow({
  resolved,
  onGone,
  children,
}: {
  resolved: boolean;
  onGone: () => void;
  children: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);
  const reduced = usePrefersReducedMotion();

  // Held in a ref so a parent that hands down a fresh closure every render
  // cannot restart the timers underneath a row that is already on its way out.
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  useEffect(() => {
    if (!resolved) return;
    const t = setTimeout(() => setLeaving(true), HOLD_MS);
    return () => clearTimeout(t);
  }, [resolved]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => goneRef.current(), reduced ? 0 : COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [leaving, reduced]);

  return (
    <div
      aria-hidden={leaving || undefined}
      className={`grid transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.55,0,1,0.45)] motion-reduce:transition-none ${
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
      style={{ transitionDuration: `${COLLAPSE_MS}ms` }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export type DoneEntry = {
  id: string;
  /** Who it was, in his words: the account name. */
  label: string;
  /** What happened to it: "Sent", "Dismissed". One word where one will do. */
  outcome: string;
};

/**
 * The most recent resolutions of this session, newest first.
 *
 * BOUND (HARD RULE bound-every-append): capped at MAX entries, oldest dropped.
 * A day of Outbound is dozens of decisions and this list is a glance-back, not
 * a log. The durable record is the draft's own status in nb_outbound_drafts
 * and the HubSpot note it filed, both of which outlive this page.
 */
const MAX_DONE = 40;

export function useDoneLog() {
  const [done, setDone] = useState<DoneEntry[]>([]);
  const log = useCallback((entry: DoneEntry) => {
    setDone((prev) => (prev.some((d) => d.id === entry.id) ? prev : [entry, ...prev].slice(0, MAX_DONE)));
  }, []);
  return { done, log };
}

/**
 * The foot of a working queue: what left it, collapsed.
 *
 * Same vocabulary as the SDR rail's finished pile, one word and a count, so
 * the two screens read as one system. Closed by default: the whole point of
 * the pattern is getting handled work off the screen.
 */
export function DoneSection({ entries }: { entries: DoneEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C] transition-colors hover:text-[#5B6560]"
      >
        <span>Done</span>
        <span className="tabular-nums text-[#B4B9B3]">{entries.length}</span>
        <Ico name={open ? "chevron-up" : "chevron-down"} size={12} />
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
          {entries.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
              <span className="min-w-0 truncate text-[13px] text-[#3D4A44]">{e.label}</span>
              <span className="shrink-0 text-[12px] text-[#8A928C]">{e.outcome}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
