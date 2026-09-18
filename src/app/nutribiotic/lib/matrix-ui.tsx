"use client";

/**
 * The Matrix screen: the book on two axes, urgent x important and effort x
 * yield. See matrix.ts for where every coordinate comes from.
 *
 * WHAT THIS DOES DIFFERENTLY FROM THE AGENCY ONE (jobhunt/Hunter's Eisenhower
 * board), because "like jobhunt but better" was the ask:
 *
 *   Placement is derived, not dragged. Hunter's quadrant is a smallint someone
 *   set once; nothing ages it, so "urgent" there means "felt urgent whenever I
 *   last touched this". Here a card's quadrant is recomputed on every load from
 *   the same stored facts the rest of the OS ranks by, and the fact that put it
 *   there is printed on the card. Nothing to maintain, nothing to go stale.
 *
 *   It works with a thumb. Hunter moves cards with HTML5 dragstart, which does
 *   not fire on touch at all, and its phone breakpoint hides the rename and
 *   notes affordances outright, so the phone is a read-only poster. Here there
 *   is nothing to drag: every row is a link to the one action that account
 *   needs, at a 44px target, and a quadrant opens to full width on a tap.
 *
 *   Quadrants are bounded. Hunter appends every row into a cell with no cap, so
 *   one busy quadrant stretches the grid and buries its own top item. Each cell
 *   here shows its best few and says how many more there are.
 *
 *   Empty means empty. Hunter dims an empty quadrant to 40% opacity and only
 *   when a filter is on. Here an empty cell says, in words, that it is empty.
 */

import Link from "next/link";
import { useState } from "react";
import { QUADRANTS, type MatrixRow, type Quadrant } from "./matrix";
import { Ico, money } from "./ui";

/**
 * One accent, then a neutral ramp, weight tracking consequence: quadrant I
 * wears the department's green, the rest get progressively lighter ink.
 *
 * Hunter paints IV (its throwaway quadrant) in the same green it uses for OK,
 * which reads as "these are fine" on the pile you are choosing to ignore. The
 * ramp below cannot make that mistake: nothing below I is colored at all.
 */
const RAIL: Record<Quadrant, string> = {
  I: "#2C6A46",
  II: "#3D4A44",
  III: "#8A928C",
  IV: "#C9CCC6",
};

const ACTION_ICON: Record<string, string> = {
  call: "phone",
  visit: "route",
  email: "mail",
  open: "external",
};

/** How many rows a quadrant shows before it says "+N more". Four keeps all
 *  four cells roughly square on a phone, which is the only way the 2x2 stays
 *  a 2x2 there instead of one tall column pretending to be a grid. */
const CELL_ROWS = 4;

const ORDER: Quadrant[] = ["I", "II", "III", "IV"];

function Row({ row, dense }: { row: MatrixRow; dense: boolean }) {
  return (
    <Link
      prefetch={false}
      href={row.actionHref}
      className="flex min-h-[44px] items-center gap-2 border-t border-[#EDEBE3] px-2.5 py-2 transition-colors first:border-t-0 hover:bg-[#F7F6F1]"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-medium text-[#14201B]">{row.name}</span>
          {row.tier && (
            <span className="shrink-0 text-[10.5px] text-[#8A928C]">HQ {row.tier}</span>
          )}
        </span>
        {/* The evidence sentence, in the open. A card nobody can audit is a
            card nobody can correct, and on Hunter this lives behind a caret. */}
        <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-[#5B6560]">
          {row.urgencyReason || "No urgency fact on file"}
        </span>
      </span>
      {row.yieldUsd != null && (
        /* In a two-up cell on a phone there is no room for a figure beside a
           name that is already truncating, so it waits for the width. Opened
           to full width, or on a desktop, it is always worth the column. */
        <span
          className={`shrink-0 text-[11.5px] tabular-nums text-[#5B6560] ${dense ? "hidden sm:inline" : ""}`}
        >
          {money(row.yieldUsd)}
        </span>
      )}
      <span className="shrink-0 text-[#8A928C]">
        <Ico name={ACTION_ICON[row.actionKind] ?? "external"} size={14} />
      </span>
    </Link>
  );
}

function Cell({
  q,
  rows,
  focused,
  onFocus,
}: {
  q: Quadrant;
  rows: MatrixRow[];
  focused: boolean;
  onFocus: () => void;
}) {
  const shown = focused ? rows : rows.slice(0, CELL_ROWS);
  const rest = rows.length - shown.length;
  return (
    /* Full height of its grid row on purpose: the four cells are one square,
       and a quadrant that shrinks to fit its own emptiness turns the matrix
       into a masonry list. An empty cell stays the size of its neighbour and
       says so in the middle of it. */
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
      <button
        type="button"
        onClick={onFocus}
        aria-expanded={focused}
        className="flex w-full items-center gap-2 border-l-[3px] px-2.5 py-2.5 text-left transition-colors hover:bg-[#F7F6F1]"
        style={{ borderLeftColor: RAIL[q] }}
      >
        <span className="font-[family-name:var(--font-fraunces)] text-[15px] font-semibold leading-none text-[#14201B]">
          {q}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[#14201B]">
            {QUADRANTS[q].title}
          </span>
          <span className="block truncate text-[11px] text-[#8A928C]">{QUADRANTS[q].sense}</span>
        </span>
        <span className="shrink-0 text-[13px] tabular-nums text-[#5B6560]">{rows.length}</span>
      </button>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center border-t border-[#EDEBE3] px-2.5 py-6 text-[12px] text-[#8A928C]">
          Nothing here.
        </p>
      ) : (
        <div>
          {shown.map((r) => (
            <Row key={r.id} row={r} dense={!focused} />
          ))}
          {rest > 0 && (
            <button
              type="button"
              onClick={onFocus}
              className="flex min-h-[40px] w-full items-center justify-center border-t border-[#EDEBE3] px-2.5 text-[12px] text-[#3D4A44] transition-colors hover:bg-[#F7F6F1]"
            >
              {rest} more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- scatter */

/** Inset so a dot on the axis extreme is not half-clipped by the frame, and
 *  so the top row of dots clears the corner labels rather than sitting in
 *  them (the first build put "Take first" underneath its own best account). */
const PAD = 11;

/** The four corners of effort x yield, named as the call they imply. */
const CORNERS: { key: string; label: string; x: number; y: number; anchor: "start" | "end" }[] = [
  { key: "tl", label: "Take first", x: 2.5, y: 5.5, anchor: "start" },
  { key: "tr", label: "Worth the work", x: 97.5, y: 5.5, anchor: "end" },
  { key: "bl", label: "Small change", x: 2.5, y: 97.5, anchor: "start" },
  { key: "br", label: "Leave", x: 97.5, y: 97.5, anchor: "end" },
];

/** The stored clauses are sentence fragments by construction; this is the only
 *  place one is shown as a sentence. */
function sentence(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function Scatter({ rows }: { rows: MatrixRow[] }) {
  const [pinned, setPinned] = useState<string | null>(null);

  // Only rows carrying a revenue percentile can take a yield position. An
  // account with no dollars and no grade is listed below the plot instead of
  // being drawn at zero, which would read as "worth nothing measured".
  const plotted = rows.filter((r) => r.important != null);
  const unplaced = rows.length - plotted.length;

  /*
   * BOTH AXES ARE THIS BOARD'S OWN ORDER, and the split is its median.
   *
   * The first build positioned yield by the book-wide revenue percentile and
   * effort by its raw 0-1, which drew every dot into the top-left and left the
   * other half of the square empty: of course it did, these forty are the top
   * of a 450-account book, so against the whole book they are all "high". A
   * chart where the dividing lines never fall between anything is decoration.
   * Ranking inside the plotted set puts the line where it means something,
   * "richer than half of what is on this screen", and the dollars themselves
   * are printed on the card rather than implied by a position.
   */
  const rank = (key: (r: MatrixRow) => number) => {
    const order = [...plotted].sort((a, b) => key(a) - key(b));
    const at = new Map(order.map((r, i) => [r.id, order.length < 2 ? 0.5 : i / (order.length - 1)]));
    return (r: MatrixRow) => at.get(r.id) ?? 0.5;
  };
  const effortRank = rank((r) => r.effort);
  const yieldRank = rank((r) => r.important as number);

  const points = plotted.map((r) => ({
    row: r,
    x: PAD + effortRank(r) * (100 - 2 * PAD),
    y: PAD + (1 - yieldRank(r)) * (100 - 2 * PAD),
  }));

  const active = points.find((p) => p.row.id === pinned)?.row ?? null;

  return (
    <div>
      <div className="flex gap-2">
        <span className="flex w-5 shrink-0 items-center justify-center text-[10.5px] tracking-wide text-[#8A928C] [writing-mode:vertical-lr] rotate-180">
          Yield
        </span>
        <svg
          viewBox="0 0 100 100"
          className="aspect-square w-full touch-manipulation rounded-lg border border-[#E2DFD5] bg-white"
        >
          {/* The one quadrant worth calling out: cheap and big. */}
          <rect x="0" y="0" width="50" height="50" fill="#2C6A46" opacity="0.05" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="#E2DFD5" strokeWidth="0.4" strokeDasharray="2 2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#E2DFD5" strokeWidth="0.4" strokeDasharray="2 2" />

          {CORNERS.map((c) => (
            <text
              key={c.key}
              x={c.x}
              y={c.y}
              textAnchor={c.anchor}
              fill="#8A928C"
              style={{ fontSize: "4.2px" }}
            >
              {c.label}
            </text>
          ))}

          {points.map((p) => {
            const on = p.row.id === pinned;
            const best = p.x < 50 && p.y < 50;
            return (
              <g key={p.row.id} onClick={() => setPinned(p.row.id)} className="cursor-pointer">
                {/* A finger is wider than the mark it is aiming at. */}
                <circle cx={p.x} cy={p.y} r="4.5" fill="transparent" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={on ? 2.6 : 1.9}
                  fill={best ? "#2C6A46" : "#8A928C"}
                  stroke="#FFFFFF"
                  strokeWidth="0.5"
                >
                  <title>
                    {p.row.name}
                    {p.row.yieldUsd != null ? ` · ${money(p.row.yieldUsd)}` : ""}
                  </title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="ml-7 mt-1.5 text-center text-[10.5px] tracking-wide text-[#8A928C]">Effort</p>

      <div className="mt-3 min-h-[68px] rounded-lg border border-[#E2DFD5] bg-white p-3">
        {active ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[14px] font-medium text-[#14201B]">{active.name}</span>
              {active.yieldUsd != null && (
                <span className="shrink-0 text-[12.5px] tabular-nums text-[#5B6560]">
                  {money(active.yieldUsd)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-[#5B6560]">
              {sentence(active.effortReason) || "Nothing on file about the work involved"}
            </p>
            <Link
              prefetch={false}
              href={active.actionHref}
              className="mt-2.5 inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#14201B] px-3 text-[13px] text-[#F7F6F1] transition-colors hover:bg-[#25332C]"
            >
              <Ico name={ACTION_ICON[active.actionKind] ?? "external"} size={14} />
              {active.actionLabel}
            </Link>
          </>
        ) : (
          <p className="text-[12.5px] text-[#8A928C]">Tap a dot for the account.</p>
        )}
      </div>

      {unplaced > 0 && (
        <p className="mt-2 text-[12px] text-[#5B6560]">
          {unplaced} carry no revenue or HQ grade, so they take no yield position and are not
          drawn.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ screen */

export function MatrixScreen({
  rows,
  live,
  noUrgencyFact,
}: {
  rows: MatrixRow[];
  /** How many live accounts the cap was taken from, so the cap is visible. */
  live: number;
  noUrgencyFact: number;
}) {
  const [view, setView] = useState<"eisenhower" | "effort">("eisenhower");
  const [focus, setFocus] = useState<Quadrant | null>(null);

  const byQuadrant: Record<Quadrant, MatrixRow[]> = { I: [], II: [], III: [], IV: [] };
  for (const r of rows) byQuadrant[r.quadrant].push(r);

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ["eisenhower", "Eisenhower"],
            ["effort", "Effort / yield"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`min-h-[36px] rounded-md px-3 text-[13px] transition-colors ${
              view === key
                ? "bg-[#14201B] text-[#F7F6F1]"
                : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "eisenhower" ? (
        <>
          {focus ? (
            <div>
              <button
                type="button"
                onClick={() => setFocus(null)}
                className="mb-2 inline-flex min-h-[36px] items-center gap-1.5 text-[13px] text-[#3D4A44] transition-colors hover:text-[#14201B]"
              >
                <Ico name="chevron-up" size={14} />
                All four
              </button>
              <Cell q={focus} rows={byQuadrant[focus]} focused onFocus={() => setFocus(null)} />
            </div>
          ) : (
            /* Two columns at every width, Juan's standing call on the agency
               board: four quadrants you can see at once is the whole point of
               a 2x2, and a phone that stacks them into a list has just built a
               list. Tapping a cell opens it full width, which is how the rows
               stay legible without breaking the grid. */
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {ORDER.map((q) => (
                <Cell
                  key={q}
                  q={q}
                  rows={byQuadrant[q]}
                  focused={false}
                  onFocus={() => setFocus(q)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <Scatter rows={rows} />
      )}

      {/* What the board is standing on, which on a screen headed "work this
          first" is not a footnote. Two figures, no lecture. */}
      <p className="mt-4 text-[12px] leading-relaxed text-[#5B6560]">
        {rows.length} of {live} live accounts.
        {noUrgencyFact > 0 && <> {noUrgencyFact} carry no urgency fact on file.</>}
      </p>
    </div>
  );
}
