"use client";

/**
 * Which day of the horizon is active, as tabs. Pulled out of RoutePanel.tsx
 * (2026-09-24) so the same day switcher can sit at the top of AddPlaceSheet's
 * flow too, one component rather than a second one that could drift from it.
 */

import { dayLabel } from "../lib/field-week";

export function DayTabs({
  days,
  active,
  onSelect,
}: {
  days: string[];
  active: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Route day" className="mb-2 flex flex-wrap items-center gap-1.5">
      {days.map((day) => {
        const { weekday, short } = dayLabel(day);
        const isActive = day === active;
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(day)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              isActive
                ? "bg-[#14201B] text-[#F7F6F1]"
                : "border border-[#E2DFD5] bg-white text-[#5B6560] hover:bg-[#FAF9F5]"
            }`}
          >
            {weekday} <span className="tabular-nums opacity-80">{short}</span>
          </button>
        );
      })}
    </div>
  );
}
