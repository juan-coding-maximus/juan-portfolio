/**
 * Account priority. ONE deterministic function, three surfaces.
 *
 * WHY THIS EXISTS. Juan's ask, 2026-09-08, off a vendor deck that named three
 * gaps in how a rep spends a day: no consistent way to rank accounts by revenue
 * potential, no structured way to reallocate time when an account stops being
 * viable, and no ranked "do this next" that survives jumping between screens.
 * Outbound already had one honest answer to a slice of that (migration 0035's
 * urgency, graded from what the HubSpot conversation actually said). This is
 * that discipline widened to the whole book, and it does not replace urgency
 * anywhere: on Outbound, urgency still sorts first and this only breaks ties
 * inside a tier.
 *
 * IT IS CODE, NOT A MODEL. Root AGENTS.md P2: "where a script can enforce this
 * deterministically, the script, not model discretion, is the authority."
 * Every number below is arithmetic over columns that already exist. Nothing in
 * this file reads free text, calls an LLM, or produces a figure that is not a
 * transform of a stored value.
 *
 * NOTHING IS STORED, AND THAT IS DELIBERATE (P4, one source of truth per fact).
 * 0035 stores `urgency` + `urgency_reason` because a model read free text to
 * produce them: that is expensive, non-reproducible, and needs its working
 * shown on the row forever. A priority score is a pure function of columns the
 * database already versions, so persisting it would create a second editable
 * copy of a derived fact that goes stale the moment an order lands. What 0035
 * actually requires is that a score never travels without its evidence, and
 * that is enforced here structurally: `reason` is a non-optional field of
 * PriorityResult, assembled from the same values that produced the number, so
 * there is no code path that can render a score without one.
 *
 * A NULL SCORE IS NOT A ZERO. Same rule 0035 wrote down for urgency: an
 * account none of whose inputs are known scores `null` and sorts last, rather
 * than being laundered into "we looked and it is worth nothing".
 *
 * INPUTS, and where each one really comes from:
 *
 *   revenue    nb_accounts.trailing_12m_revenue  written ONLY by load_orders.py,
 *                                                summing nb_orders.revenue_cents
 *                                                over the last 12 months
 *              nb_accounts.lifetime_revenue      ERP TOTAL_SALES, via
 *                                                normalize_xlsx.py -> promote_import.py
 *              nb_accounts.potential_hq          HQ's own A-G capacity grade,
 *                                                mirrored from HubSpot
 *                                                (potential__cloned_), surfaced
 *                                                as nb_v_account_potential.potential_grade
 *   engagement nb_outbound_drafts.urgency        0/1/2 from migration 0035
 *              nb_v_activities_effective.at      last real touch, netted of
 *                                                corrections (HARD RULE 18)
 *   viability  nb_accounts.last_order_at         }
 *              nb_accounts.expected_reorder_days } load_orders.py's rollup
 *              nb_accounts.lifecycle             }
 *              nb_accounts.places_status         Google Places businessStatus
 *              nb_accounts.closed_at / do_not_visit
 *
 * WHAT DOES NOT EXIST, and is therefore not used: nb_accounts.annual_revenue_usd
 * is NULL on every one of Juan's accounts, and current_state / future_state are
 * NULL on every one. They are not approximated here; an input nobody has ever
 * filled is a gap to report, not a default to invent (HARD RULE 1).
 */

/** The weights. Stated once, here, so a change to the ranking is a diff. */
export const PRIORITY_WEIGHTS = { revenue: 45, engagement: 30, viability: 25 } as const;

/** How far back a touch still counts as a live conversation, and where it
 *  decays to nothing. Both are shaping constants, not measurements, and they
 *  are named rather than buried so the curve can be argued with. */
const RECENCY_FRESH_DAYS = 14;
const RECENCY_COLD_DAYS = 180;

/**
 * HQ's A-G potential grade as an evenly spaced ordinal. This is a scale
 * transform of a real stored grade, not a revenue estimate, and the evidence
 * sentence always says "HQ potential C" rather than implying a dollar figure.
 */
const GRADE_SCALE: Record<string, number> = { A: 1, B: 0.83, C: 0.67, D: 0.5, E: 0.33, F: 0.17, G: 0 };

export type PriorityInput = {
  id: string;
  name: string;
  lifecycle: string | null;
  /** nb_v_account_potential.potential_grade, the bare letter. */
  tier: string | null;
  trailing_12m_revenue: number | null;
  lifetime_revenue: number | null;
  last_order_at: string | null;
  expected_reorder_days: number | null;
  places_status?: string | null;
  closed_at?: string | null;
  do_not_visit?: boolean | null;
  phone?: string | null;
  /** Highest urgency among this account's PENDING drafts, and its stored
   *  reason. Null means no graded pending draft, never "no urgency". */
  urgency?: number | null;
  urgency_reason?: string | null;
  /** Most recent nb_v_activities_effective.at for this account. */
  last_touch_at?: string | null;
};

export type NextAction = {
  kind: "call" | "visit" | "email" | "open";
  label: string;
  /** Deep link straight into the surface that does it. */
  href: string;
};

export type PriorityResult = {
  id: string;
  /** 0-100, or null when not one input is known. Null sorts last. */
  score: number | null;
  band: "now" | "soon" | "later" | "unscored";
  /** Never optional. A score with no stated evidence is a black box, and
   *  0035 already settled that argument for this department. */
  reason: string;
  /** Share of the total weight that was actually measured, 0-1. */
  confidence: number;
  inputsKnown: number;
  inputsTotal: number;
  parts: { revenue: number | null; engagement: number | null; viability: number | null };
  action: NextAction;
  /** Set when a hard fact suppresses the account entirely. */
  suppressed: string | null;
};

const DAY = 86_400_000;

function daysBetween(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY);
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Fraction of `values` strictly below `v`. A percentile over the real
 *  distribution of the book, not a band someone picked. */
function percentile(sorted: number[], v: number): number {
  if (sorted.length < 2) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo / (sorted.length - 1);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Score every account against the rest of the book.
 *
 * WHY THE WHOLE BOOK AT ONCE. The revenue component is a percentile inside
 * Juan's own territory, so it needs the population. Scoring one account in
 * isolation would need an absolute dollar band, and there is no honest source
 * for one: $2,400 a year is a strong natural grocer and a weak chiropractor
 * chain, and the only non-invented answer to "is this a big account" is "big
 * compared to the 437 others on this list".
 */
export function computePriority(rows: PriorityInput[], nowMs = Date.now()): Map<string, PriorityResult> {
  // The revenue distributions, built from rows that actually carry a figure.
  // An account with no loaded orders is absent from these, never a zero in them.
  const t12 = rows.map((r) => r.trailing_12m_revenue).filter((v): v is number => typeof v === "number" && v > 0).sort((a, b) => a - b);
  const life = rows.map((r) => r.lifetime_revenue).filter((v): v is number => typeof v === "number" && v > 0).sort((a, b) => a - b);

  const out = new Map<string, PriorityResult>();

  for (const r of rows) {
    const clauses: string[] = [];

    // -- Hard suppressors. Facts, not weights: a closed door outranks any
    // score. load_orders.py's rule is honoured, an order inside the last 12
    // months outranks a Places closure snippet (six of Juan's paying accounts
    // are marked CLOSED_PERMANENTLY on the map and still buy).
    const daysSinceOrder = daysBetween(r.last_order_at, nowMs);
    const boughtRecently = daysSinceOrder !== null && daysSinceOrder <= 365;
    let suppressed: string | null = null;
    if (r.closed_at) suppressed = "closed";
    else if (r.do_not_visit) suppressed = "do not visit";
    else if (r.places_status === "CLOSED_PERMANENTLY" && !boughtRecently) suppressed = "Places says closed permanently";

    // ---------------------------------------------------------------- revenue
    const revSubs: number[] = [];
    if (typeof r.trailing_12m_revenue === "number" && r.trailing_12m_revenue > 0) {
      revSubs.push(percentile(t12, r.trailing_12m_revenue));
      clauses.push(`${usd(r.trailing_12m_revenue)} in the last 12 months`);
    } else if (typeof r.lifetime_revenue === "number" && r.lifetime_revenue > 0) {
      revSubs.push(percentile(life, r.lifetime_revenue));
      clauses.push(`${usd(r.lifetime_revenue)} lifetime`);
    }
    if (r.tier && r.tier in GRADE_SCALE) {
      revSubs.push(GRADE_SCALE[r.tier]);
      clauses.push(`HQ potential ${r.tier}`);
    }
    const revenue = revSubs.length ? revSubs.reduce((a, b) => a + b, 0) / revSubs.length : null;

    // ------------------------------------------------------------- engagement
    const engSubs: number[] = [];
    if (typeof r.urgency === "number") {
      engSubs.push(r.urgency === 2 ? 1 : r.urgency === 1 ? 0.6 : 0.2);
      // The evidence travels verbatim. It is the account's own words, read out
      // of the HubSpot conversation by draft_urgency.py, and rewording it here
      // would put a second voice on a fact that already has one.
      clauses.push(
        r.urgency === 2
          ? `draft needs a reply today${r.urgency_reason ? `: ${r.urgency_reason}` : ""}`
          : r.urgency === 1
            ? `open draft${r.urgency_reason ? `: ${r.urgency_reason}` : ""}`
            : "open draft, no urgency stated",
      );
    }
    const daysSinceTouch = daysBetween(r.last_touch_at, nowMs);
    if (daysSinceTouch !== null) {
      engSubs.push(
        daysSinceTouch <= RECENCY_FRESH_DAYS
          ? 1
          : clamp01((RECENCY_COLD_DAYS - daysSinceTouch) / (RECENCY_COLD_DAYS - RECENCY_FRESH_DAYS)),
      );
      clauses.push(daysSinceTouch === 0 ? "touched today" : `last touch ${daysSinceTouch}d ago`);
    }
    const engagement = engSubs.length ? engSubs.reduce((a, b) => a + b, 0) / engSubs.length : null;

    // -------------------------------------------------------------- viability
    const viaSubs: number[] = [];
    // The reorder clock, and ONLY where the account's own cadence is known.
    // expected_reorder_days is set by load_orders.py from that account's real
    // inter-order gaps and exists on a small minority of the book; a global
    // "90 days" applied to the rest would be a number nobody measured.
    if (r.expected_reorder_days && daysSinceOrder !== null) {
      const ratio = daysSinceOrder / r.expected_reorder_days;
      const overdueDays = daysSinceOrder - r.expected_reorder_days;
      viaSubs.push(ratio < 0.5 ? 0.4 : ratio <= 1.5 ? 1 : ratio <= 2.5 ? 0.7 : 0.3);
      clauses.push(
        overdueDays > 0
          ? `reorder ${overdueDays}d overdue on its own ${r.expected_reorder_days}d cycle`
          : `reorder due in ${-overdueDays}d on its own ${r.expected_reorder_days}d cycle`,
      );
    } else if (daysSinceOrder !== null) {
      clauses.push(`last order ${daysSinceOrder}d ago`);
    }
    if (r.lifecycle) {
      const byLifecycle: Record<string, number> = { active: 1, prospect: 0.6, dormant: 0.5, lost: 0.1 };
      if (r.lifecycle in byLifecycle) {
        viaSubs.push(byLifecycle[r.lifecycle]);
        clauses.push(r.lifecycle);
      }
    }
    const viability = suppressed ? 0 : viaSubs.length ? viaSubs.reduce((a, b) => a + b, 0) / viaSubs.length : null;

    // --------------------------------------------------------- known-only sum
    // score.py's rule, kept: compute over MEASURED inputs and renormalize, then
    // report the missing share as lost confidence. Imputing a default and then
    // presenting the result as a measurement is where a scoring system starts
    // fabricating.
    const pairs: [number | null, number][] = [
      [revenue, PRIORITY_WEIGHTS.revenue],
      [engagement, PRIORITY_WEIGHTS.engagement],
      [viability, PRIORITY_WEIGHTS.viability],
    ];
    const known = pairs.filter(([v]) => v !== null) as [number, number][];
    const totalW = PRIORITY_WEIGHTS.revenue + PRIORITY_WEIGHTS.engagement + PRIORITY_WEIGHTS.viability;
    const knownW = known.reduce((a, [, w]) => a + w, 0);
    let score: number | null = knownW > 0 ? Math.round((known.reduce((a, [v, w]) => a + v * w, 0) / knownW) * 100) : null;
    if (suppressed && score !== null) score = Math.min(score, 10);

    const inputsKnown = known.length;
    /*
     * CONFIDENCE COUNTS SUB-INPUTS, NOT COMPONENTS. Counting only the three
     * components read 1.00 for an account whose revenue rested on nothing but
     * HQ's letter grade, and Vallarta Supermarkets duly ranked above three
     * accounts with real invoices on the first run of this against live data.
     * Each component has two possible sub-inputs (dollars/grade,
     * urgency/recency, cadence/lifecycle), so confidence is the share of those
     * six, weighted. score.py's rule, unchanged: the missing share is reported
     * as lost confidence and NEVER as a damped score, because a low-confidence
     * 74 is a 74 that we are less sure of, not a 60.
     */
    const confidence =
      (PRIORITY_WEIGHTS.revenue * (revSubs.length / 2) +
        PRIORITY_WEIGHTS.engagement * (engSubs.length / 2) +
        PRIORITY_WEIGHTS.viability * (viaSubs.length / 2)) /
      totalW;

    let reason: string;
    if (suppressed) {
      reason = `${suppressed}${clauses.length ? ` · ${clauses.join(" · ")}` : ""}`;
    } else if (score === null) {
      // Not prose about nothing: it names which columns are empty, so the fix
      // is obvious (run the enricher, load the orders).
      reason = "no revenue, engagement or lifecycle data on file yet";
    } else {
      reason = clauses.join(" · ");
    }
    if (score !== null && confidence < 0.6) {
      reason += ` · scored on ${revSubs.length + engSubs.length + viaSubs.length} of 6 inputs`;
    }

    /*
     * BAND THRESHOLDS, tuned against the live book rather than picked. At
     * 70/45 the top band held 120 of 436 accounts, which is not a prescriptive
     * list, it is a quarter of the territory wearing a badge. 78/55 puts
     * roughly the top 12% in "now", which is about a fortnight of driving.
     */
    const band: PriorityResult["band"] =
      score === null ? "unscored" : suppressed ? "later" : score >= 78 ? "now" : score >= 55 ? "soon" : "later";

    out.set(r.id, {
      id: r.id,
      score,
      band,
      reason,
      confidence,
      inputsKnown,
      inputsTotal: 3,
      parts: { revenue, engagement, viability },
      action: nextAction(r, { daysSinceOrder, suppressed }),
      suppressed,
    });
  }

  return out;
}

/**
 * The one prescriptive step, chosen by rule and deep-linked into the surface
 * that performs it. This is the "ranked, prescriptive list" half of the ask:
 * a rep should not have to decide which of three tabs a top-ranked account
 * belongs in.
 *
 * Order matters and is not arbitrary: a customer who asked for something
 * outranks a clock, and a clock outranks a cold door.
 */
function nextAction(r: PriorityInput, ctx: { daysSinceOrder: number | null; suppressed: string | null }): NextAction {
  if (ctx.suppressed) {
    return { kind: "open", label: "Review", href: `/nutribiotic/account/${r.id}` };
  }
  if (typeof r.urgency === "number" && r.urgency >= 1) {
    return { kind: "email", label: "Answer the open draft", href: `/nutribiotic/outbound?account=${r.id}` };
  }
  if (r.expected_reorder_days && ctx.daysSinceOrder !== null && ctx.daysSinceOrder > r.expected_reorder_days && r.phone) {
    return { kind: "call", label: "Call about the reorder", href: `/nutribiotic/sdr?account=${r.id}` };
  }
  if (r.phone && (r.lifecycle === "dormant" || r.lifecycle === "lost")) {
    return { kind: "call", label: "Call to reopen", href: `/nutribiotic/sdr?account=${r.id}` };
  }
  return { kind: "visit", label: "Put on a route", href: `/nutribiotic/map?focus=${r.id}` };
}

/**
 * The comparator every surface sorts with, so "priority order" means the same
 * thing on three screens. Null sorts LAST, never as zero.
 */
export function byPriority(a: PriorityResult | undefined, b: PriorityResult | undefined): number {
  const av = a?.score ?? -1;
  const bv = b?.score ?? -1;
  if (av !== bv) return bv - av;
  // Same score, better-measured account first. The accounts list and cadence
  // screens already sort on (tier, confidence desc) for exactly this reason:
  // between two equal numbers, prefer the one built on more real inputs.
  return (b?.confidence ?? 0) - (a?.confidence ?? 0);
}

export function bandLabel(band: PriorityResult["band"]): string {
  return band === "now" ? "high impact" : band === "soon" ? "worth a stop" : band === "later" ? "low" : "not scored";
}
