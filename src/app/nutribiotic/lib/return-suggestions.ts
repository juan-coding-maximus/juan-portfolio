/**
 * "Suggested returns": the map's ranked list of accounts worth a return
 * visit, and why. Not a second scoring system (see matrix.ts's own header on
 * that): it reads the same two real facts the rest of the book already
 * carries, a stated "come back" instruction and a reorder cycle past its own
 * measured due date, and says nothing about an account that has neither.
 *
 * Pure and synchronous: the two reads it needs (getPriorityBook's ranked
 * book, listPendingReturnDirectives) already happen on the map page for
 * other reasons, so this just re-shapes what is already in hand rather than
 * costing the page a third query.
 */

import type { ReturnDirective } from "./dal";
import { reorderUrgencyOf, URGENCY_LEVELS } from "./matrix";
import type { PriorityInput, PriorityResult } from "./priority";

export type ReturnSuggestion = {
  accountId: string;
  /** What put this account on the list, in its own stored words. Never a
   *  template sentence: a directive shows the extractor's own phrasing, a
   *  reorder shows matrix.ts's own reorderUrgencyOf sentence. */
  reason: string;
  /** RFC3339 only when the field note stated one. Null is normal. */
  statedTime: string | null;
  kind: "directive" | "reorder";
  /** nb_directives.id, only for kind "directive": what the panel resolves
   *  (dal.ts's resolveDirective) once Juan acts on the row, so
   *  nutribiotic-route-planner never offers the same account twice. Null for
   *  a reorder suggestion, which has no directive row to close. */
  directiveId: string | null;
  /** Sort key only, not a score shown anywhere. */
  rank: number;
};

/**
 * `[follow-up:visit] Shine Natural Market: come back with the protein
 * samples · Stated time: 2026-09-30T12:00:00-07:00 · Bring the case count`
 * back into its stated pieces. Whatever the extractor did not carry through
 * (no time, no extra note) is simply absent below, never filled in.
 */
function parseFollowUp(directive: string): { title: string; statedTimeIso: string | null; extra: string | null } {
  const withoutTag = directive.replace(/^\[follow-up:[a-z]+\]\s*/, "");
  const parts = withoutTag.split(" · ");
  const first = parts[0] ?? withoutTag;
  const colon = first.indexOf(": ");
  const title = colon > -1 ? first.slice(colon + 2) : first;
  const timePart = parts.find((p) => p.startsWith("Stated time: "));
  const statedTimeIso = timePart ? timePart.slice("Stated time: ".length) : null;
  const extra =
    parts
      .slice(1)
      .filter((p) => p !== "No time stated" && !p.startsWith("Stated time:") && !p.startsWith("Stated duration:"))
      .join(". ") || null;
  return { title, statedTimeIso, extra };
}

export function buildReturnSuggestions(
  ranked: { account: PriorityInput; result: PriorityResult }[],
  directives: ReturnDirective[],
  nowMs = Date.now(),
): ReturnSuggestion[] {
  const accountIds = new Set(ranked.map((r) => r.account.id));
  const out: ReturnSuggestion[] = [];
  const seen = new Set<string>();

  for (const d of directives) {
    // Juan's book only: a directive against an account another rep owns, or
    // one already closed off the ranked book, is not offered as a route
    // suggestion (it is still queued for nutribiotic-route-planner as-is).
    if (seen.has(d.account_id) || !accountIds.has(d.account_id)) continue;
    seen.add(d.account_id);
    const { title, statedTimeIso, extra } = parseFollowUp(d.directive);
    out.push({
      accountId: d.account_id,
      reason: [title, extra].filter(Boolean).join(". "),
      statedTime: statedTimeIso,
      kind: "directive",
      directiveId: d.id,
      rank: statedTimeIso ? 3 : 2,
    });
  }

  for (const { account } of ranked) {
    if (seen.has(account.id)) continue;
    const urgency = reorderUrgencyOf(account, nowMs);
    if (urgency.value !== URGENCY_LEVELS.reorderLate && urgency.value !== URGENCY_LEVELS.reorderDue) continue;
    seen.add(account.id);
    out.push({
      accountId: account.id,
      reason: urgency.reason,
      statedTime: null,
      kind: "reorder",
      directiveId: null,
      rank: 1 + (urgency.value ?? 0),
    });
  }

  return out.sort((a, b) => b.rank - a.rank);
}
