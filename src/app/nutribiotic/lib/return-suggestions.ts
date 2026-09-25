/**
 * "Suggested returns": accounts worth going back to because Juan said so in a
 * logged field note, call, or visit. Juan's correction 2026-09-25: not a
 * second scoring system over the book, and not the reorder cycle either --
 * only a stated "come back" instruction, already queued in nb_directives,
 * ever puts an account on this list.
 *
 * A directive with a resolved date inside the coming 7 days is a suggestion
 * for that exact date, always shown there regardless of how many other
 * suggestions that day already has -- it is a fact Juan stated, not a
 * scheduling choice. A directive with no stated date, or one outside the
 * coming week, is backlog: it spreads across the week's days oldest-first,
 * capped at 4 total suggestions per day. A day already full from dated
 * commitments takes no backlog; a week already full simply carries the rest
 * over to the next computation.
 *
 * Pure and synchronous: the two reads it needs (getPriorityBook's ranked
 * book, listPendingReturnDirectives) already happen on the map page for
 * other reasons, so this just re-shapes what is already in hand rather than
 * costing the page a third query.
 */

import type { ReturnDirective } from "./dal";
import { planningHorizonDates } from "./field-week";
import type { PriorityInput, PriorityResult } from "./priority";

export type ReturnSuggestion = {
  accountId: string;
  /** What put this account on the list, in its own stored words. Never a
   *  template sentence: the extractor's own title/notes phrasing. */
  reason: string;
  /** A short verbatim excerpt from the field note stating the return ask,
   *  only when the note carried one (older queued directives predate this
   *  field). Absent, never a placeholder, when there isn't one. */
  quote: string | null;
  /** RFC3339 only when the field note stated one. Null is normal. */
  statedTime: string | null;
  /** YYYY-MM-DD, the day within the coming week this suggestion is for. */
  suggestedDate: string;
  /** nb_directives.id: what the panel resolves (dal.ts's resolveDirective)
   *  once Juan acts on the row, so nutribiotic-route-planner never offers
   *  the same account twice. */
  directiveId: string;
  /** The directive's created_at: the day Juan actually said this, shown as
   *  "because on <weekday>, <month> <day>". */
  loggedAt: string;
};

/**
 * `[follow-up:visit] Shine Natural Market: come back with the protein
 * samples · Stated time: 2026-09-30T12:00:00-07:00 · Bring the case count ·
 * Quote: "come back with the protein samples"` back into its stated pieces.
 * Whatever the extractor did not carry through (no time, no quote, no extra
 * note) is simply absent below, never filled in.
 */
function parseFollowUp(
  directive: string,
): { title: string; statedTimeIso: string | null; extra: string | null; quote: string | null } {
  const withoutTag = directive.replace(/^\[follow-up:[a-z]+\]\s*/, "");
  const parts = withoutTag.split(" · ");
  const first = parts[0] ?? withoutTag;
  const colon = first.indexOf(": ");
  const title = colon > -1 ? first.slice(colon + 2) : first;
  const timePart = parts.find((p) => p.startsWith("Stated time: "));
  const statedTimeIso = timePart ? timePart.slice("Stated time: ".length) : null;
  const quotePart = parts.find((p) => p.startsWith('Quote: "') && p.endsWith('"'));
  const quote = quotePart ? quotePart.slice('Quote: "'.length, -1) : null;
  const extra =
    parts
      .slice(1)
      .filter(
        (p) =>
          p !== "No time stated" &&
          !p.startsWith("Stated time:") &&
          !p.startsWith("Stated duration:") &&
          !p.startsWith("Quote:"),
      )
      .join(". ") || null;
  return { title, statedTimeIso, extra, quote };
}

export function buildReturnSuggestions(
  ranked: { account: PriorityInput; result: PriorityResult }[],
  directives: ReturnDirective[],
): ReturnSuggestion[] {
  const accountIds = new Set(ranked.map((r) => r.account.id));
  const week = planningHorizonDates(7);
  const weekSet = new Set(week);

  const seen = new Set<string>();
  type Parsed = ReturnType<typeof parseFollowUp>;
  const dated: { directive: ReturnDirective; parsed: Parsed; date: string }[] = [];
  const backlog: { directive: ReturnDirective; parsed: Parsed }[] = [];

  for (const d of directives) {
    // Juan's book only: a directive against an account another rep owns, or
    // one already closed off the ranked book, is not offered as a route
    // suggestion (it is still queued for nutribiotic-route-planner as-is).
    // One directive per account, the earliest pending one (listPendingReturn-
    // Directives already orders oldest first).
    if (seen.has(d.account_id) || !accountIds.has(d.account_id)) continue;
    const parsed = parseFollowUp(d.directive);
    const statedDate = parsed.statedTimeIso ? parsed.statedTimeIso.slice(0, 10) : null;
    // A stated date past the coming week is not forced into it; it waits and
    // resurfaces once the horizon reaches it.
    if (statedDate && !weekSet.has(statedDate)) continue;
    seen.add(d.account_id);
    if (statedDate) dated.push({ directive: d, parsed, date: statedDate });
    else backlog.push({ directive: d, parsed });
  }

  function toSuggestion(directive: ReturnDirective, parsed: Parsed, date: string): ReturnSuggestion {
    return {
      accountId: directive.account_id,
      reason: [parsed.title, parsed.extra].filter(Boolean).join(". "),
      quote: parsed.quote,
      statedTime: parsed.statedTimeIso,
      suggestedDate: date,
      directiveId: directive.id,
      loggedAt: directive.created_at,
    };
  }

  const capacity = new Map(week.map((d) => [d, 4]));
  const out: ReturnSuggestion[] = [];

  // A stated date is a fact Juan already committed to, always shown on its
  // day, uncapped -- the 4/day limit governs backlog filling, not this.
  for (const { directive, parsed, date } of dated) {
    out.push(toSuggestion(directive, parsed, date));
    capacity.set(date, (capacity.get(date) ?? 4) - 1);
  }

  // Undated backlog spreads oldest-first into whatever room the week still
  // has left. A week already full carries the remainder to next time.
  const backlogByAge = [...backlog].sort(
    (a, b) => new Date(a.directive.created_at).getTime() - new Date(b.directive.created_at).getTime(),
  );
  for (const { directive, parsed } of backlogByAge) {
    const day = week.find((d) => (capacity.get(d) ?? 0) > 0);
    if (!day) break;
    out.push(toSuggestion(directive, parsed, day));
    capacity.set(day, (capacity.get(day) ?? 0) - 1);
  }

  return out;
}
