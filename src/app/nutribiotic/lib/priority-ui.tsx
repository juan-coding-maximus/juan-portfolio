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
import { accountType } from "./account-filters";
import type { PriorityBook } from "./dal";
import { bandLabel, byPriority, type PriorityInput, type PriorityResult } from "./priority";
import { Ico } from "./ui";

const BAND_CLASS: Record<PriorityResult["band"], string> = {
  now: "bg-[#F3E3C6] text-[#8A6D2F]",
  soon: "border border-[#DAD7CC] text-[#5B6560]",
  later: "border border-[#E2DFD5] text-[#8A928C]",
  unscored: "border border-[#E2DFD5] text-[#8A928C]",
};

const ACTION_ICON: Record<string, string> = { call: "phone", visit: "route", email: "mail", open: "external" };

/** One score-row's real rendered height (py-2 + the 12.5px name line + its
 *  border): every list on the right rail caps its box at a whole number of
 *  these rather than an eyeballed pixel guess, so "N rows visible" means N
 *  rows exactly, whichever list it is. */
const ROW_H = 34;

/**
 * The short code each territory area wears on a narrow right-rail row (Juan,
 * 2026-09-14: "make sure the lists have a dot next to each where it says
 * their location in a shortened version," naming BEV/OCS/SB/SD/IN/VEN
 * himself). Purely a display abbreviation of `nb_territory_areas.id`, never a
 * second copy of the area's identity: the id, label and colour still come
 * from listAreas() alone, this only picks how few letters stand for them
 * here. A key with no entry falls back to its own first three letters
 * (areaAbbr below), so a new area is never invisible for want of an edit
 * to this table, only less legible than a chosen code would be.
 */
const AREA_ABBR: Record<string, string> = {
  "san-diego": "SD",
  oceanside: "Ocs",
  "orange-county": "OC",
  "inland-empire": "IE",
  "east-la": "eLA",
  "palm-desert": "PD",
  "south-bay": "Bay",
  "south-la": "sLA",
  "santa-monica-venice": "Ven",
  westwood: "WWD",
  "beverly-hills-weho": "Bev",
  "hollywood-pasadena": "HLY",
  "woodland-hills": "WDH",
  "upper-valley": "VAL",
  ventura: "VTA",
  "santa-barbara": "SB",
  "san-luis-obispo": "SLO",
  inland: "IN",
};

function areaAbbr(areaId: string): string {
  return AREA_ABBR[areaId] ?? areaId.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase();
}

/** area id -> colour, the same map/lib/dal.ts's TerritoryArea rows already
 *  carry; passed down rather than re-derived so a right-rail dot and the
 *  map's own frontier for that area can never disagree about its colour. */
export type AreaColorMap = Record<string, string>;

/** The dot + code itself, rendered only where the account has an area to
 *  show (a cold prospect nobody has geocoded/assigned yet prints nothing,
 *  never a guessed location). */
function AreaTag({ areaId, areaColor }: { areaId: string | null | undefined; areaColor: AreaColorMap }) {
  if (!areaId) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium tabular-nums text-[#8A928C]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: areaColor[areaId] ?? "#C9CCC6" }} />
      {areaAbbr(areaId)}
    </span>
  );
}

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
}: {
  book: PriorityBook;
  limit?: number;
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
    </section>
  );
}

/**
 * The SDR page's right rail, 2026-09-08: "all time best" beside "SDR work to
 * do" (the day rail) and whichever account is centered in the panel. Narrower
 * than PriorityPanel's rows (no evidence sentence, no action button, just
 * rank/score/name), because this is a scan-and-pick list of up to 100, not a
 * short prescriptive one, and it needs to fit beside two other columns.
 *
 * EVERY ROW OPENS IN THE SDR QUEUE (Juan, 2026-09-08), not a read-only
 * account popup: `/nutribiotic/sdr?account=<id>` is the same deep link
 * PriorityPanel's action button already uses, and SdrScreen already knows
 * how to open that account in the center panel whether or not it has a row
 * scheduled (see sdr-ui.tsx's `focusAccountId`).
 */
/** The one row markup both TopOpportunities and OpportunityList render, so
 *  "same style" is guaranteed by sharing the function, not by copying JSX. */
function ScoreRows({ rows, areaColor }: { rows: PriorityBook["ranked"]; areaColor: AreaColorMap }) {
  return (
    <ul className="flex flex-col">
      {rows.map(({ account, result }) => (
        <li key={account.id} className="border-b border-[#F0EEE6] last:border-b-0">
          <Link
            href={`/nutribiotic/sdr?account=${account.id}`}
            className="flex items-center gap-2 px-2.5 py-2 hover:bg-[#FAF9F5]"
          >
            <span
              className={`w-7 shrink-0 rounded px-1 py-0.5 text-center text-[10.5px] font-medium tabular-nums ${BAND_CLASS[result.band]}`}
            >
              {result.score}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#14201B]">{account.name}</span>
            <AreaTag areaId={account.area} areaColor={areaColor} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TopOpportunities({
  ranked,
  areaColor,
  limit = 100,
  visibleRows = 8,
}: {
  /** `PriorityBook.ranked` itself, NOT the book: `PriorityBook.byId` is a
   *  `Map`, which cannot cross the server/client prop boundary, and this
   *  component is rendered from sdr-ui.tsx's client-side SdrScreen so it
   *  can sit in the same row as the (client-state-driven) day rail and
   *  account panel. `ranked` is a plain array, serializes fine. */
  ranked: PriorityBook["ranked"];
  areaColor: AreaColorMap;
  limit?: number;
  /** Rows tall before it scrolls (Juan, 2026-09-14: "top opportunities is
   *  too long of a rectangle"). All up to `limit` are still in the list,
   *  scrollable, this only caps how much of the rail one box eats. */
  visibleRows?: number;
}) {
  const rows = ranked.slice(0, limit);
  if (rows.length === 0) return null;

  return (
    <div className="w-full">
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5B6560]">Top Opportunities</div>
      <div
        className="overflow-y-auto rounded-lg border border-[#E2DFD5] bg-white"
        style={{ maxHeight: ROW_H * visibleRows }}
      >
        <ScoreRows rows={rows} areaColor={areaColor} />
      </div>
    </div>
  );
}

/**
 * ONE TYPE-FILTERED LIST, same rail, same row style, just shorter (Juan,
 * 2026-09-14: "a few lists on the right, by type of client... make each list
 * rectangle shorter, housing only 8 opportunities but scrollable within").
 *
 * Sorted purely by score ("descending order of fit /100"), deliberately NOT
 * `book.ranked`'s own order: the top rail leads with hand-added accounts
 * over /search ones at the same score (byOriginThenPriority), which is the
 * right rule for "call this first" and the wrong one for "who do we have of
 * this type" -- a type list answers the second question, so it re-sorts on
 * `byPriority` alone.
 */
function OpportunityList({
  ranked,
  areaColor,
  title,
  match,
  visibleRows = 8,
}: {
  ranked: PriorityBook["ranked"];
  areaColor: AreaColorMap;
  title: string;
  match: (account: PriorityInput) => boolean;
  visibleRows?: number;
}) {
  const rows = ranked.filter((r) => match(r.account)).sort((a, b) => byPriority(a.result, b.result));
  if (rows.length === 0) return null;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5B6560]">{title}</span>
        <span className="text-[10.5px] tabular-nums text-[#8A928C]">{rows.length}</span>
      </div>
      <div
        className="overflow-y-auto rounded-lg border border-[#E2DFD5] bg-white"
        style={{ maxHeight: ROW_H * visibleRows }}
      >
        <ScoreRows rows={rows} areaColor={areaColor} />
      </div>
    </div>
  );
}

/**
 * The three fixed opportunity types Juan named, 2026-09-14: "same column and
 * style as Top opportunities just under it." Each predicate reuses whatever
 * already classifies an account rather than inventing a second vocabulary:
 * `accountType()` (account-filters.ts, ERP channel -> Juan's five types) for
 * an account somebody has already typed a channel on, OR'd with the specialty
 * words a /search "Look further" pass read straight off the business's own
 * site (`fit_tags`, places_search_ingest.py's FIT_TERMS) for one that hasn't
 * -- a freshly landed medspa lands with channel "unknown" until a human sets
 * it, and without this half it would be invisible on this rail on day one.
 * "Small grocery" has no fit-tag equivalent (a grocer's site rarely states a
 * product specialty the way a spa does), so it reads the raw channel value
 * literally: nb_accounts.channel `"grocery"` is already the independent/small
 * store value, distinct from `"mass_retail"`.
 */
const BEAUTY_TAGS = new Set(["facials", "microblading", "PRP", "skincare"]);
const SPORTS_NUTRITION_TAGS = new Set([
  "sports nutrition", "protein", "vegan protein", "nutraceuticals", "vitamin", "supplements",
]);

export function OpportunityTypeLists({
  ranked,
  areaColor,
}: {
  ranked: PriorityBook["ranked"];
  areaColor: AreaColorMap;
}) {
  const hasTag = (account: PriorityInput, tags: Set<string>) => (account.fit_tags ?? []).some((t) => tags.has(t));
  return (
    <>
      <OpportunityList
        title="Beauty Opportunities"
        ranked={ranked}
        areaColor={areaColor}
        match={(a) => accountType(a.channel) === "beauty" || hasTag(a, BEAUTY_TAGS)}
      />
      <OpportunityList
        title="Small Grocery"
        ranked={ranked}
        areaColor={areaColor}
        match={(a) => (a.channel ?? "") === "grocery"}
      />
      <OpportunityList
        title="Sports Nutrition"
        ranked={ranked}
        areaColor={areaColor}
        match={(a) => accountType(a.channel) === "sports" || hasTag(a, SPORTS_NUTRITION_TAGS)}
      />
    </>
  );
}
