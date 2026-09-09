/**
 * The consolidated element, and deliberately NOT a fourth page.
 *
 * The gap Juan named was tool overload and context-switching: a rep chasing
 * whatever looks active, jumping between screens to find out what it is worth.
 * The obvious fix is a new "priority workspace" tab, and that is the wrong one,
 * it is a fifth thing to learn and a second place where the same account is
 * described. So the ranked list is a COMPONENT that renders identically at the
 * top of Map, SDR and Outbound, and each row's one prescriptive action deep
 * links into whichever of those surfaces performs it. Wherever Juan already is,
 * the same answer is already on screen, and acting on it is one tap.
 *
 * Every row carries its evidence sentence in the open, not in a tooltip: the
 * score is the claim and the sentence is the source, and 0035 already settled
 * that a priority nobody can audit is a priority nobody can correct.
 *
 * Server-renderable on purpose (no "use client"): it is pure presentation over
 * data the page already fetched, so it costs no client bundle on three pages.
 */

import Link from "next/link";
import type { PriorityBook } from "./dal";
import { bandLabel, type PriorityResult } from "./priority";
import { Ico } from "./ui";

const BAND_CLASS: Record<PriorityResult["band"], string> = {
  now: "bg-[#F3E3C6] text-[#8A6D2F]",
  soon: "border border-[#DAD7CC] text-[#5B6560]",
  later: "border border-[#E2DFD5] text-[#8A928C]",
  unscored: "border border-[#E2DFD5] text-[#8A928C]",
};

const ACTION_ICON: Record<string, string> = { call: "phone", visit: "route", email: "mail", open: "external" };

/**
 * The score as a chip. `reason` rides in the title so the evidence is one
 * hover away even where the row has no space to print it; a chip with no
 * reason attached is not renderable, the prop is required.
 */
export function PriorityChip({ result, compact = false }: { result: PriorityResult | undefined; compact?: boolean }) {
  // Not scored is not zero. Nothing is drawn rather than drawing a 0 that
  // would read as "we checked and it is worthless" (HARD RULE 1).
  if (!result || result.score === null) return null;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${BAND_CLASS[result.band]}`}
      title={result.reason}
    >
      {result.score}
      {compact ? "" : ` · ${bandLabel(result.band)}`}
    </span>
  );
}

function ActionLink({ result }: { result: PriorityResult }) {
  return (
    <Link
      href={result.action.href}
      className="flex shrink-0 items-center gap-1 rounded-md border border-[#E2DFD5] px-2 py-1 text-[12px] font-medium text-[#3D4A44] transition-colors hover:bg-[#F7F6F1]"
    >
      <Ico name={ACTION_ICON[result.action.kind] ?? "external"} size={11} />
      {result.action.label}
    </Link>
  );
}

/**
 * The ranked list itself. `limit` is small on purpose: a prescriptive list is
 * only prescriptive while it is short enough to finish.
 */
export function PriorityPanel({
  book,
  limit = 8,
  surface,
}: {
  book: PriorityBook;
  limit?: number;
  /** Which page is rendering it, named in the footer so the coverage line
   *  cannot be mistaken for a claim about a different screen's data. */
  surface: "map" | "sdr" | "outbound";
}) {
  const rows = book.ranked.slice(0, limit);
  if (rows.length === 0) return null;

  const { coverage } = book;

  return (
    <section className="mb-5 rounded-lg border border-[#E2DFD5] bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Work this first</span>
        <span className="text-[11.5px] text-[#8A928C]">
          {coverage.scored} of {coverage.accounts} accounts scored
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {rows.map(({ account, result }) => (
          <li
            key={account.id}
            className="flex items-start gap-2.5 rounded-md border border-[#EFEDE5] px-2.5 py-2"
          >
            <span className="mt-0.5 w-8 shrink-0 text-right font-[family-name:var(--font-fraunces)] text-[17px] font-semibold tabular-nums text-[#14201B]">
              {result.score}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link
                  href={`/nutribiotic/account/${account.id}`}
                  className="text-[13.5px] font-medium text-[#14201B] hover:underline"
                >
                  {account.name}
                </Link>
                <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${BAND_CLASS[result.band]}`}>
                  {bandLabel(result.band)}
                </span>
              </div>
              {/* The evidence, printed. Every clause in it is a value read off
                  a named column, assembled by priority.ts, never phrased by a
                  model and never padded when an input is missing. */}
              <div className="mt-0.5 text-[12px] leading-snug text-[#5B6560]">{result.reason}</div>
            </div>
            <ActionLink result={result} />
          </li>
        ))}
      </ul>

      {/* What the ranking could not see. Stated on the surface rather than
          left for someone to discover, because a rep who does not know the
          cadence is unknown on 92% of the book will read a low viability
          score as a judgement instead of as a gap. */}
      <p className="mt-2 text-[11.5px] leading-snug text-[#8A928C]">
        Scored from real order dollars, HQ potential, open-draft urgency, last touch and reorder cadence.{" "}
        {coverage.withRevenue} accounts carry a revenue figure, {coverage.withCadence} carry a measured reorder cycle,{" "}
        {coverage.withUrgency} have a graded open draft. Anything missing lowers confidence rather than scoring zero.
        {surface === "outbound" ? " Draft urgency still leads this queue; priority only breaks ties inside a tier." : ""}
      </p>
    </section>
  );
}
