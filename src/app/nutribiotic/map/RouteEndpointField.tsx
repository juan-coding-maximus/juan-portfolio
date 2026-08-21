"use client";

/**
 * THE START/END PICKER (migration 0040). Juan's ask: type "HOM" and see Home,
 * 1012 9th St, Manhattan Beach as a pick; type a hotel's name and see it with
 * its address, so an overnight run can start or end somewhere that is not his
 * apartment without moving the waypoint pin itself.
 *
 * Not a form: the current label ("Home", or whatever place is picked) is a
 * button; clicking it swaps in a text field and a dropdown, the same
 * open-in-place shape AddStopForm below it on this screen already uses.
 *
 * THE HOME ROW IS SYNTHESIZED, NOT SEARCHED. Google Places has never heard of
 * "home", it is Juan's own name for the waypoint account, so a query that
 * looks like it is asking for home ("hom", "apartment", or the account's own
 * street) is matched here against `home` directly, live results underneath
 * come from Google. Nothing is looked up until three characters exist, the
 * same floor resolveStopAddress uses, so "an", "sb" etc. do not fire a call.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import type { RouteEndpoint } from "../lib/dal";
import { searchRouteAddresses } from "../lib/stop-actions";
import { Ico } from "../lib/ui";

const HOME_WORDS = ["home", "apartment", "house"];

function matchesHome(home: RouteEndpoint, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    HOME_WORDS.some((w) => w.startsWith(needle)) ||
    home.label.toLowerCase().includes(needle) ||
    home.address.toLowerCase().includes(needle)
  );
}

export function RouteEndpointField({
  value,
  home,
  onChange,
}: {
  /** The override Juan picked, if any. Null means "use `home`". */
  value: RouteEndpoint | null;
  /** The waypoint account, or null if none is on the map. */
  home: RouteEndpoint | null;
  onChange: (ep: RouteEndpoint | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RouteEndpoint[]>([]);
  const [searching, startSearch] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = value ?? home;
  const label = current?.label ?? "start/end";

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function runSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchRouteAddresses(q));
      });
    }, 250);
  }

  function pick(ep: RouteEndpoint | null) {
    onChange(ep);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  const q = query.trim();
  const homeMatches = home && matchesHome(home, q);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={current ? `${current.label} · ${current.address} -- click to change` : "Set where the route starts or ends"}
        className="inline-flex items-center gap-1 border-b border-dashed border-[#A9AFA9] font-medium text-[#3D4A44] transition-colors hover:border-[#3D4A44] hover:text-[#14201B]"
      >
        {label}
        <Ico name="chevron-down" size={10} />
      </button>
    );
  }

  return (
    <div ref={boxRef} className="relative inline-block align-middle">
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          runSearch(e.target.value);
        }}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={label}
        className="w-44 rounded-md border border-[#8A928C] bg-white px-2 py-1 text-[13px] outline-none"
      />
      <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-auto rounded-md border border-[#E2DFD5] bg-white py-1 text-left shadow-lg">
        {homeMatches && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-[#FAF9F5]"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#14201B]">
              <Ico name="pin" size={11} />
              {home!.label}
            </span>
            <span className="truncate text-[11.5px] text-[#8A928C]">{home!.address}</span>
          </button>
        )}
        {searching && <div className="px-3 py-1.5 text-[12px] text-[#8A928C]">Searching...</div>}
        {!searching && q.length >= 3 && results.length === 0 && !homeMatches && (
          <div className="px-3 py-1.5 text-[12px] text-[#8A928C]">No match. Try the city name too.</div>
        )}
        {q.length > 0 && q.length < 3 && !homeMatches && (
          <div className="px-3 py-1.5 text-[12px] text-[#8A928C]">Keep typing...</div>
        )}
        {results.map((r, i) => (
          <button
            key={`${r.lat},${r.lng},${i}`}
            type="button"
            onClick={() => pick(r)}
            className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-[#FAF9F5]"
          >
            <span className="truncate text-[13px] font-medium text-[#14201B]">{r.label}</span>
            <span className="truncate text-[11.5px] text-[#8A928C]">{r.address}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
