/**
 * The two axes the Matrix screen places work on, and nothing else.
 *
 * WHY THIS IS NOT A SECOND SCORING SYSTEM. priority.ts already answers "what
 * is worth working", and three surfaces rank from it. This file does not
 * re-answer that. It only SPLITS what priority.ts already measured into the
 * two questions a 2x2 asks, so the matrix and the ranked panel can never
 * disagree about an account:
 *
 *   important  = result.parts.revenue, the revenue percentile inside Juan's
 *                own book blended with HQ's potential grade. Verbatim, not
 *                recomputed. "How much is this account worth."
 *   urgent     = the stored facts that say SOON, which parts.revenue and
 *                parts.engagement each only half carry: a graded pending
 *                draft, the rep's own readiness tag, and a reorder past its
 *                own measured cycle.
 *
 * URGENCY IS DERIVED HERE RATHER THAN LIFTED because parts.engagement runs the
 * wrong way for this question. It scores a FRESH touch high (a live
 * conversation), and an account touched this morning is the opposite of one
 * needing action today. Reusing it would have put every handled account in
 * quadrant I. So urgency is its own small function over stored columns, with
 * its levels named below rather than buried, and every item carries the
 * sentence that put it where it is (priority-ui.tsx's rule: the placement is
 * the claim, the sentence is the source).
 *
 * NOTHING HERE IS PERSISTED and nothing is guessed. An account with no urgency
 * fact on file is `known: false` and says so, it is not a zero.
 */

import type { PriorityInput, PriorityResult } from "./priority";

/**
 * The urgency levels, stated once so a change to the matrix is a diff.
 *
 * Ordered, not weighted: urgency here is the STRONGEST stored fact, not a
 * blend of several. A draft that needs a reply today is not made less urgent
 * by the account also being on cycle, and averaging the two would say it was.
 */
export const URGENCY_LEVELS = {
  /** nb_outbound_drafts.urgency = 2, graded by draft_urgency.py off the account's own words. */
  draftToday: 1,
  /** nb_accounts.readiness = 'urgent', the rep's own read on the call. */
  readinessUrgent: 0.92,
  /** Past its own measured reorder cycle by more than the cycle again. */
  reorderLate: 0.8,
  /** nb_accounts.readiness = 'hot'. */
  readinessHot: 0.66,
  /** nb_outbound_drafts.urgency = 1, an open draft with no same-day claim. */
  draftOpen: 0.6,
  /** Past its own measured reorder cycle at all. */
  reorderDue: 0.55,
  /** An open draft that draft_urgency.py graded as not urgent. */
  draftCold: 0.3,
  /** Inside its own measured cycle: a real fact, and a quiet one. */
  onCycle: 0.15,
} as const;

/** Above this an item sits in the urgent half. Between draftOpen and reorderDue
 *  on purpose: an open draft is work waiting on Juan today, a reorder merely
 *  due this week is work waiting on a route. */
export const URGENT_AT = 0.55;

/** Above this an item sits in the important half. parts.revenue is a
 *  percentile over Juan's own book, so 0.5 is literally "bigger than half the
 *  accounts he carries", which is the only non-invented place to cut it. */
export const IMPORTANT_AT = 0.5;

const DAY = 86_400_000;

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(t) ? null : Math.floor((now - t) / DAY);
}

export type Urgency = {
  /** 0-1, or null when not one urgency fact is on file. */
  value: number | null;
  /** The stored fact that set it, in its own words. Empty only when value is null. */
  reason: string;
};

/**
 * The strongest urgency fact on file for this account, and the sentence for it.
 *
 * Reads only columns that exist and are filled: a pending draft's grade, the
 * readiness tag, and the reorder clock (which load_orders.py sets from the
 * account's OWN inter-order gaps, so it exists on a minority of the book and
 * is never stood in for by a global default).
 */
/**
 * The reorder-cycle fact alone, split out (2026-09-25) so a screen that only
 * cares about "is this account due for a visit" -- the map's Suggested
 * returns panel -- reads the exact same math and wording urgencyOf folds in
 * below, rather than a second copy that could drift from it.
 */
export function reorderUrgencyOf(
  a: Pick<PriorityInput, "last_order_at" | "expected_reorder_days">,
  nowMs = Date.now(),
): Urgency {
  const sinceOrder = daysSince(a.last_order_at, nowMs);
  if (!a.expected_reorder_days || sinceOrder === null) return { value: null, reason: "" };
  const over = sinceOrder - a.expected_reorder_days;
  if (over > a.expected_reorder_days) {
    return {
      value: URGENCY_LEVELS.reorderLate,
      reason: `Reorder ${over}d late on its own ${a.expected_reorder_days}d cycle`,
    };
  }
  if (over > 0) {
    return {
      value: URGENCY_LEVELS.reorderDue,
      reason: `Reorder ${over}d overdue on its own ${a.expected_reorder_days}d cycle`,
    };
  }
  return {
    value: URGENCY_LEVELS.onCycle,
    reason: `Reorder due in ${-over}d on its own ${a.expected_reorder_days}d cycle`,
  };
}

export function urgencyOf(a: PriorityInput, nowMs = Date.now()): Urgency {
  const found: { value: number; reason: string }[] = [];

  if (typeof a.urgency === "number") {
    if (a.urgency === 2) {
      found.push({
        value: URGENCY_LEVELS.draftToday,
        reason: `Draft needs a reply today${a.urgency_reason ? `: ${a.urgency_reason}` : ""}`,
      });
    } else if (a.urgency === 1) {
      found.push({
        value: URGENCY_LEVELS.draftOpen,
        reason: `Open draft${a.urgency_reason ? `: ${a.urgency_reason}` : ""}`,
      });
    } else {
      found.push({ value: URGENCY_LEVELS.draftCold, reason: "Open draft, no urgency stated" });
    }
  }

  if (a.readiness === "urgent") {
    found.push({ value: URGENCY_LEVELS.readinessUrgent, reason: "Rep tagged this urgent" });
  } else if (a.readiness === "hot") {
    found.push({ value: URGENCY_LEVELS.readinessHot, reason: "Rep tagged this hot" });
  }

  const reorder = reorderUrgencyOf(a, nowMs);
  if (reorder.value !== null) found.push({ value: reorder.value, reason: reorder.reason });

  if (!found.length) return { value: null, reason: "" };
  const top = found.reduce((a2, b) => (b.value > a2.value ? b : a2));
  return { value: top.value, reason: top.reason };
}

/**
 * How much work stands between here and an order, 0-1, high meaning more.
 *
 * Every term is a stored fact about what is NOT yet done, never a drive time:
 * there is no measured travel figure on these rows, and inventing one to make
 * a nicer x-axis is exactly the fabrication HARD RULE 1 forbids.
 */
export function effortOf(a: PriorityInput, r: PriorityResult): { value: number; reason: string } {
  const terms: number[] = [];
  const why: string[] = [];

  if (!a.last_order_at) {
    terms.push(1);
    why.push("never ordered");
  } else {
    terms.push(0.15);
    why.push("has ordered before");
  }

  if (a.readiness === "cold") {
    terms.push(0.9);
    why.push("rep tagged this cold");
  } else if (a.readiness === "urgent" || a.readiness === "hot") {
    terms.push(0.1);
    why.push(`rep tagged this ${a.readiness}`);
  }

  // What the score could not be measured on is work too: an account nobody has
  // filled in needs the discovery call before it needs anything else.
  const unknown = 1 - r.confidence;
  if (r.inputsTotal > 0) {
    terms.push(unknown);
    if (unknown > 0.5) why.push(`${r.inputsTotal - r.inputsKnown} of ${r.inputsTotal} inputs still unknown`);
  }

  return {
    value: terms.reduce((x, y) => x + y, 0) / terms.length,
    reason: why.join(", "),
  };
}

export type MatrixItem = {
  account: PriorityInput;
  result: PriorityResult;
  /** 0-1 from parts.revenue, or null when the account carries no revenue or grade. */
  important: number | null;
  urgency: Urgency;
  effort: { value: number; reason: string };
  /** Real dollars where they exist. Null is printed as absent, never as $0. */
  yieldUsd: number | null;
  quadrant: Quadrant;
};

export type Quadrant = "I" | "II" | "III" | "IV";

/**
 * The four quadrants, in the terms a solo field rep works in.
 *
 * NOT the textbook's "delegate" for III: Juan carries this territory alone,
 * and a quadrant telling him to hand work to somebody would be furniture. A
 * small account with a live draft is a five-minute reply, so III says that.
 */
export const QUADRANTS: Record<Quadrant, { title: string; sense: string }> = {
  I: { title: "Do now", sense: "Urgent and worth it" },
  II: { title: "Schedule", sense: "Worth it, not yet urgent" },
  III: { title: "Clear fast", sense: "Urgent, small" },
  IV: { title: "Later", sense: "Neither, for now" },
};

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

function quadrantOf(important: number | null, urgency: number | null): Quadrant {
  // An unmeasured axis is treated as its low side for PLACEMENT only, and the
  // card says which fact is missing. The alternative, a fifth "unplaced" bin,
  // was worse: it hides exactly the accounts nobody has filled in yet.
  const imp = (important ?? 0) >= IMPORTANT_AT;
  const urg = (urgency ?? 0) >= URGENT_AT;
  if (urg && imp) return "I";
  if (!urg && imp) return "II";
  if (urg && !imp) return "III";
  return "IV";
}

/**
 * Place the book on both axes.
 *
 * `suppressed` accounts are dropped outright, not sorted low: priority.ts sets
 * that flag on a closed door or a do-not-visit, and a screen headed "work this
 * first" has no honest row for one.
 */
export function placeOnMatrix(
  ranked: { account: PriorityInput; result: PriorityResult }[],
  nowMs = Date.now(),
): MatrixItem[] {
  const out: MatrixItem[] = [];
  for (const { account, result } of ranked) {
    if (result.suppressed) continue;
    const important = result.parts.revenue;
    const urgency = urgencyOf(account, nowMs);
    out.push({
      account,
      result,
      important,
      urgency,
      effort: effortOf(account, result),
      /* First figure that is actually a figure. A zero is priority.ts's "no
         loaded orders", not a measured nothing, and printing "$0" beside a
         live account states a fact nobody established. */
      yieldUsd: positive(account.trailing_12m_revenue) ?? positive(account.lifetime_revenue),
      quadrant: quadrantOf(important, urgency.value),
    });
  }
  return out;
}

/** Best first inside a quadrant: the same score the rest of the OS ranks by. */
export function byMatrixRank(a: MatrixItem, b: MatrixItem): number {
  return (b.result.score ?? -1) - (a.result.score ?? -1);
}

/**
 * What crosses to the client, and deliberately nothing more.
 *
 * The screen is interactive (focus a quadrant, tap a dot), so it is a client
 * component, and a client component that imported MatrixItem would drag
 * priority.ts and its dal.ts types into the browser bundle. This is the flat,
 * already-rendered row instead: strings and numbers, no account object.
 */
export type MatrixRow = {
  id: string;
  name: string;
  /** HQ potential grade, the bare letter, always shown with its scale. */
  tier: string | null;
  quadrant: Quadrant;
  /** 0-1 revenue percentile, null when the account carries neither revenue nor grade. */
  important: number | null;
  urgency: number | null;
  /** The stored fact behind the placement. Empty when there is none on file. */
  urgencyReason: string;
  effort: number;
  effortReason: string;
  yieldUsd: number | null;
  score: number | null;
  actionLabel: string;
  actionHref: string;
  actionKind: string;
};

export function toMatrixRows(items: MatrixItem[]): MatrixRow[] {
  return items.map((m) => ({
    id: m.account.id,
    name: m.account.name,
    tier: m.account.tier,
    quadrant: m.quadrant,
    important: m.important,
    urgency: m.urgency.value,
    urgencyReason: m.urgency.reason,
    effort: m.effort.value,
    effortReason: m.effort.reason,
    yieldUsd: m.yieldUsd,
    score: m.result.score,
    actionLabel: m.result.action.label,
    actionHref: m.result.action.href,
    actionKind: m.result.action.kind,
  }));
}
