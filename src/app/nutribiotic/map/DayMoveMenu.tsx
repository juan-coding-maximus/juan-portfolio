"use client";

/**
 * THE DAY PICKER (2026-08-25). Was a single ">>" button that always meant
 * "push to tomorrow's tab" (see the postponeToNextDay comment this replaces
 * in route-context.tsx). Juan's ask: let that button open a picker so a stop
 * or call can jump to ANY day on the horizon, not just the next one -- a
 * Monday stop that needs to move to Thursday used to cost three taps.
 *
 * SAME PORTAL IDIOM AS RouteEndpointField (migration 0040): this button sits
 * inside the route card, which is `overflow-hidden` so its rounded corners
 * clip square-cornered rows. A menu positioned `absolute` inside that card
 * would be clipped the same way. Rendered into a portal, positioned from the
 * trigger's own bounding rect, escapes that ancestor's clip.
 *
 * `days`/`active` come straight from useRoute() -- the same rolling
 * ten-weekday horizon DayTabs renders, so a stop can never be moved onto a
 * day that is not itself a tab.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dayLabel } from "../lib/field-week";
import { Ico } from "../lib/ui";

export function DayMoveMenu({
  days,
  active,
  onPick,
  label,
  icon = "chevrons-right",
}: {
  /** The rolling horizon, same list DayTabs shows. */
  days: string[];
  /** The day this stop/call is on today -- disabled in the list, since
      picking it would be a no-op. */
  active: string;
  onPick: (day: string) => void;
  /** Accessible name for the trigger, e.g. "Move Sports Basement to a day". */
  label: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Right-aligned to the trigger: this button sits at the right edge of
      // the row, and a left-aligned menu would run off the viewport on a
      // phone screen.
      setMenuPos({ top: r.bottom + 4, left: r.right - 176 });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [open]);

  function pick(day: string) {
    setOpen(false);
    if (day === active) return;
    onPick(day);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
      >
        <Ico name={icon} size={13} />
      </button>
      {menuPos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, left: Math.max(8, menuPos.left) }}
            role="listbox"
            aria-label="Move to day"
            className="fixed z-50 max-h-72 w-44 overflow-auto rounded-md border border-[#E2DFD5] bg-white py-1 shadow-lg"
          >
            {days.map((day) => {
              const { weekday, short } = dayLabel(day);
              const isActive = day === active;
              return (
                <button
                  key={day}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  disabled={isActive}
                  onClick={() => pick(day)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${
                    isActive
                      ? "cursor-default text-[#A9AFA9]"
                      : "text-[#14201B] hover:bg-[#FAF9F5]"
                  }`}
                >
                  <span>
                    <span className="font-medium">{weekday}</span>{" "}
                    <span className="tabular-nums text-[#8A928C]">{short}</span>
                  </span>
                  {isActive && <span className="text-[11px]">current</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
