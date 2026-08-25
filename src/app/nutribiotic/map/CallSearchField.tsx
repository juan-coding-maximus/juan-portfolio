"use client";

/**
 * THE CALL SEARCHER (2026-08-25), for AddCallForm's "who" field in
 * RoutePanel.tsx. Juan's ask: type a name, contact or company, and get a
 * phone number without leaving the route panel to look someone up in
 * HubSpot by hand.
 *
 * SAME PORTAL IDIOM AS RouteEndpointField/DayMoveMenu: this field sits
 * inside the route card, which is `overflow-hidden`, so the results list is
 * rendered into a portal on <body>, positioned from the trigger's own
 * bounding rect rather than `absolute` inside the clipping ancestor.
 *
 * STILL A PLAIN TEXT FIELD. Nothing here blocks typing a name HubSpot has
 * never heard of and a phone number by hand, same as before this existed --
 * the search is a shortcut over the top of the existing two inputs, not a
 * replacement for them. Picking a result fills both fields; nothing is
 * locked afterward, so a wrong autofill is one keystroke to correct.
 */

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { HubspotCallCandidate } from "../lib/hubspot-people-search";
import { searchHubspotForCall } from "../lib/hubspot-people-search";
import { prettyPhone } from "../lib/ui";

const KIND_LABEL: Record<HubspotCallCandidate["kind"], string> = {
  contact: "contact",
  company: "company",
};

export function CallSearchField({
  label,
  onChangeLabel,
  onPick,
  autoFocus,
}: {
  label: string;
  onChangeLabel: (v: string) => void;
  /** Fires when a HubSpot result is picked, phone may be null if neither the
      contact nor its company (or vice versa) had one on file. */
  onPick: (result: HubspotCallCandidate) => void;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<HubspotCallCandidate[]>([]);
  const [searching, startSearch] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    function place() {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      setMenuPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function runSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchHubspotForCall(q));
      });
    }, 250);
  }

  function pick(r: HubspotCallCandidate) {
    onPick(r);
    setOpen(false);
    setResults([]);
  }

  const q = label.trim();

  return (
    <div ref={boxRef} className="relative min-w-0 flex-[2]">
      <input
        value={label}
        onChange={(e) => {
          onChangeLabel(e.target.value);
          setOpen(true);
          runSearch(e.target.value);
        }}
        onFocus={() => label.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Who, e.g. Alex Conrad, Vasari Plaster"
        autoFocus={autoFocus}
        className="w-full min-w-0 rounded-md border border-[#E2DFD5] bg-[#FCFBF7] px-3 py-2 text-[13.5px] outline-none placeholder:text-[#A9AFA9] focus:border-[#8A928C]"
      />
      {open &&
        menuPos &&
        q.length >= 2 &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            className="fixed z-50 max-h-72 overflow-auto rounded-md border border-[#E2DFD5] bg-white py-1 text-left shadow-lg"
          >
            {searching && <div className="px-3 py-1.5 text-[12px] text-[#8A928C]">Searching HubSpot...</div>}
            {!searching && results.length === 0 && (
              <div className="px-3 py-1.5 text-[12px] text-[#8A928C]">
                No HubSpot match. Type the name and phone by hand.
              </div>
            )}
            {results.map((r) => (
              <button
                key={`${r.kind}:${r.id}`}
                type="button"
                onClick={() => pick(r)}
                className="flex w-full items-start justify-between gap-2 px-3 py-1.5 text-left hover:bg-[#FAF9F5]"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-[#14201B]">{r.label}</span>
                    {/* THE TYPE TAG (Juan's ask): when a query matches both a
                        contact and a company, this is the only thing telling
                        them apart in the list. */}
                    <span className="shrink-0 rounded bg-[#F0EEE4] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A928C]">
                      {KIND_LABEL[r.kind]}
                    </span>
                  </span>
                  {r.phoneVia && (
                    <span className="block truncate text-[11px] text-[#A9AFA9]">via {r.phoneVia}</span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-[#5B6560]">
                  {r.phone ? prettyPhone(r.phone) : "no phone on file"}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
