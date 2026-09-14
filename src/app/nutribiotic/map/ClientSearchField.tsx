"use client";

/**
 * THE CLIENT SEARCHER (2026-09-14), for AddStopForm's fourth kind in
 * RoutePanel.tsx. Juan's ask: put an account on the day by typing its name,
 * without hunting for its pin on the map first.
 *
 * ONE UNIFIED SEARCH, NO TOGGLE. Clients and prospects come out of the same
 * box, because "which of the two is this" is not a question he has in hand
 * while typing a name. The only thing separating them in the list is a tag,
 * read off lead_stage (the same fact AccountsMap's prospects layer reads), so
 * nothing here invents a status.
 *
 * SEARCHES THE LIST ALREADY ON SCREEN, not the server. The map page loads
 * Juan's whole owned book (listOwnerAccounts, owner-scoped server side), and
 * that same array is what MapScreen resolves a route entry back into. Picking
 * from anything wider would let a stop be added that the route then silently
 * drops on render, since an id with no account in that array is not drawn.
 *
 * SAME PORTAL IDIOM AS CallSearchField/RouteEndpointField: the form sits
 * inside a clipping ancestor, so the results list renders into a portal on
 * <body>, positioned from the input's own bounding rect.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MapAccount } from "../lib/dal";

export type ClientSearchAccount = Pick<
  MapAccount,
  "id" | "name" | "city" | "state" | "lat" | "lng" | "lifecycle" | "lead_stage"
>;

const LIMIT = 8;

/** Name match, prefix first. Word-start beats mid-word beats nothing, which is
 *  what makes typing "sprout" put Sprouts above "Bean Sprout Cafe". */
function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.includes(` ${q}`)) return 1;
  if (n.includes(q)) return 2;
  return -1;
}

export function ClientSearchField({
  accounts,
  inRoute,
  onPick,
}: {
  accounts: ClientSearchAccount[];
  /** Ids already on the active day. Shown, not hidden: "it is already on this
   *  day" is the answer to the search, and an account that quietly never
   *  appears reads as a missing account. */
  inRoute: Set<string>;
  onPick: (account: ClientSearchAccount) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (q.length < 2) return [];
    const hits: { a: ClientSearchAccount; r: number }[] = [];
    for (const a of accounts) {
      // The waypoint account is Juan's apartment (migration 0029), the two
      // ends of the day rather than a place anything is sold. Never a stop.
      if (a.lifecycle === "waypoint") continue;
      const r = rank(a.name, q);
      if (r >= 0) hits.push({ a, r });
    }
    hits.sort((x, y) => x.r - y.r || x.a.name.localeCompare(y.a.name));
    return hits.slice(0, LIMIT).map((h) => h.a);
  }, [accounts, q]);

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

  function pick(a: ClientSearchAccount) {
    onPick(a);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative min-w-0">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          // Enter on a single unambiguous match adds it, so a name typed in
          // full does not need a second aim at a dropdown row.
          if (e.key === "Enter") {
            e.preventDefault();
            const first = results.filter((a) => !inRoute.has(a.id))[0];
            if (first) pick(first);
          }
        }}
        placeholder="Search your accounts, e.g. Lassens Los Alamitos"
        autoFocus
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
            {results.length === 0 && (
              <div className="px-3 py-1.5 text-[12px] text-[#8A928C]">
                No account of yours by that name. Add a lunch, hotel or other stop instead.
              </div>
            )}
            {results.map((a) => {
              const already = inRoute.has(a.id);
              const where = [a.city, a.state].filter(Boolean).join(", ");
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={already}
                  onClick={() => pick(a)}
                  className="flex w-full items-start justify-between gap-2 px-3 py-1.5 text-left hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-[#14201B]">{a.name}</span>
                      {a.lead_stage === "prospect" && (
                        <span className="shrink-0 rounded bg-[#F0EEE4] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A928C]">
                          prospect
                        </span>
                      )}
                    </span>
                    {where && <span className="block truncate text-[11px] text-[#A9AFA9]">{where}</span>}
                  </span>
                  {already && (
                    <span className="shrink-0 text-[12px] text-[#8A928C]">already on this day</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
