/**
 * THE ONE FILTER VOCABULARY, shared by /nutribiotic/map and /nutribiotic/sdr.
 *
 * Juan's ask, 2026-09-09: "map filters (for map and SDR, they should be same).
 * they need to be divided by section." Two screens had grown two filter bars
 * with overlapping words and different meanings, which is the same failure as
 * two editable copies of a fact (root AGENTS.md P4): "Prospect" meant one
 * thing on the map and nothing at all on SDR.
 *
 * So the taxonomy, the counting and the predicate all live here, once, and
 * neither screen re-implements any of it. filter-bar.tsx renders it; this file
 * decides what the words mean.
 *
 * FIVE SECTIONS, in Juan's order:
 *   1. Areas          territory_areas.json, 18 areas (unchanged)
 *   2. HQ potential   nb_accounts.potential_hq, A-G (unchanged)
 *   3. Readiness      nb_accounts.readiness (migration 0069) + a 75+ score chip
 *   4. Type           derived from nb_accounts.channel, + the Chains/Practices
 *                     hide toggles (both statements about what kind of
 *                     business this is)
 *   5. Lead status    nb_v_account_lead_stage (migration 0073) + the
 *                     Prospect hide toggle (Juan, 2026-09-09: "New leads...
 *                     that's just prospects, it's not a type of client it's
 *                     a lead status" -- it lived in Type for one day and was
 *                     wrong there)
 *
 * NOTHING HERE INVENTS A CLASSIFICATION. Every chip reads a column that
 * already exists, and an account whose channel matches none of Juan's five
 * types lands in a visible "Other" bucket carrying its real count, rather than
 * being guessed into a type or silently dropped off the screen.
 */

import type { Tier } from "./dal";
import type { Readiness } from "./priority";

// ---------------------------------------------------------------------------
// 3 · READINESS
// ---------------------------------------------------------------------------

/**
 * NOT NEW LABELS, and this is the point. nb_accounts.readiness has carried
 * exactly these four values since migration 0069 (urgent / hot / normal /
 * cold), each with a stated point adjustment into lib/priority.ts's score
 * (+20 / +10 / 0 / -10). The chips are that existing ladder, whole, in its own
 * order, reused verbatim rather than re-banded here.
 *
 * ALL FOUR, not the top two (Juan, 2026-09-09, same day, after seeing Urgent
 * and Hot alone). A rep who tagged an account Cold made a real call about it,
 * and "what did I already write off" is a question worth being able to ask;
 * Normal is likewise a tag someone applied, not the absence of one. An
 * untagged account carries null and matches no chip, which is what keeps
 * "nobody has read this account yet" from reading as Normal.
 */
export const READINESS_FILTERS = ["urgent", "hot", "normal", "cold"] as const;
export type ReadinessFilter = (typeof READINESS_FILTERS)[number];

export const READINESS_LABEL: Record<ReadinessFilter, string> = {
  urgent: "Urgent",
  hot: "Hot",
  normal: "Normal",
  cold: "Cold",
};

/** The 0069 adjustment each tag makes to the priority score, shown in the
 *  chip's own tooltip so the ladder is legible from the control rather than
 *  from the migration. Signed strings, not numbers: "+0" is not a thing. */
export const READINESS_EFFECT: Record<ReadinessFilter, string> = {
  urgent: "+20 to the priority score",
  hot: "+10 to the priority score",
  normal: "no change to the priority score",
  cold: "-10 to the priority score",
};

/**
 * Juan's own number, stated in the ask ("also a button for 75+ score there"),
 * read against the same lib/priority.ts 0-100 score every other surface ranks
 * on. Deliberately NOT the "now" band's 78 and not PROSPECT_SCORE_MIN's 80:
 * those are priority.ts's own tuning knobs and re-tuning either must never
 * silently move a filter Juan asked for by name.
 */
export const HOT_SCORE_MIN = 75;

// ---------------------------------------------------------------------------
// 4 · TYPE
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = ["retail", "clinics", "beauty", "sports", "animal", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  retail: "Retail",
  clinics: "Clinics",
  beauty: "Beauty",
  sports: "Sports",
  animal: "Animal",
  other: "Other",
};

/**
 * channel -> type. nb_accounts.channel is the classifier that already exists
 * (migration 0002, filled by the enrichment pipeline from store_type); this
 * maps its live vocabulary onto the five names Juan asked for.
 *
 * WHAT IS DELIBERATELY ABSENT. `juice_smoothie_bar` (6 accounts) is not
 * mapped to Sports: a smoothie bar is not a gym, and "sports nutrition" is a
 * guess about who walks in, not a fact on the record. `pond_service` (1) is
 * not mapped to Animal for the same reason: a pond service may treat koi or
 * may treat water. Both sit in Other, counted and visible, until somebody
 * classifies them from a source rather than from a hunch.
 *
 * `coop` and `distributor` appear in channel's declared vocabulary but on zero
 * of Juan's accounts today; coop is retail by construction, a distributor is a
 * wholesale reseller and belongs in none of the five, so it reads as Other.
 */
const CHANNEL_TYPE: Record<string, AccountType> = {
  // Retail: somebody walks in and buys a bottle off a shelf.
  grocery: "retail",
  specialty: "retail",
  mass_retail: "retail",
  holistic_retail: "retail",
  pharmacy: "retail",
  online_retailer: "retail",
  coop: "retail",
  // Clinics: a practitioner's office, retail or dispensary attached.
  clinic: "clinics",
  holistic_health_services: "clinics",
  // Beauty.
  spa_beauty: "beauty",
  // Sports.
  gym: "sports",
  nutrition_club: "sports",
  // Animal.
  pet_specialty: "animal",
  animal_rescue_nonprofit: "animal",
};

/** The channel values that land in Other today, for the chip's own tooltip. */
export const UNTYPED_CHANNELS = [
  "unknown",
  "juice_smoothie_bar",
  "personal_care_manufacturer",
  "food_manufacturer",
  "industry_b2b",
  "hotel",
  "cafe_restaurant",
  "building_materials",
  "chemical_manufacturer",
  "sales_broker",
  "pond_service",
  "distributor",
];

export function accountType(channel: string | null | undefined): AccountType {
  if (!channel) return "other";
  return CHANNEL_TYPE[channel] ?? "other";
}

/**
 * THE PRACTICES HIDE TOGGLE'S real predicate (Juan, 2026-09-09): "Practices
 * should hide the small practices under the E-tier rules. Any practice that
 * is bigger is a Clinic."
 *
 * Was nb_accounts.practice_excluded, a static flag exclude_practices.py set
 * once off a name match (migration 0025) -- fine for "is this a clinic",
 * wrong for "is this worth hiding", since a size call needs a size, and 81
 * of Juan's clinics were flagged that way regardless of grade: 3 B's, 6 C's
 * and 19 D's were sitting hidden next to the 41 real E's. A clinic's tier
 * already answers "how small" (the E-rule, migration 0068's lifetime-value
 * floor tree), so hiding is now computed from channel + tier, live, rather
 * than frozen at whatever a script decided once. A clinic with no grade yet
 * is shown, not hidden: "small" is E's claim to make, not silence's.
 *
 * practice_excluded itself is untouched (nb_v_cadence_due still reads it for
 * a different question, see migration 0025) -- this is only what the map
 * and SDR filter bars mean by "Practices".
 */
export function isSmallPractice(channel: string | null | undefined, tier: Tier | null | undefined): boolean {
  return accountType(channel) === "clinics" && tier === "E";
}

// ---------------------------------------------------------------------------
// 5 · LEAD STATUS
// ---------------------------------------------------------------------------

/**
 * The five, and the only five (Juan, 2026-09-09). Values match
 * nb_v_account_lead_stage.lead_stage exactly; the view is where the rule
 * lives, this is only its name on screen. See migration 0073 for why the
 * stage is derived rather than written into nb_accounts.lead_status (that
 * column is HubSpot's hs_lead_status, pull-only, overwritten every 60s).
 */
export const LEAD_STAGES = ["prospect", "new_to_activate", "active", "dormant", "closed"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  prospect: "Prospect",
  new_to_activate: "New to Activate",
  active: "Active",
  dormant: "Dormant",
  closed: "Closed",
};

export const LEAD_STAGE_TITLE: Record<LeadStage, string> = {
  prospect: "No touchpoints logged yet. Enrichment research does not count as a touchpoint.",
  new_to_activate: "Has touchpoints, no revenue on file.",
  active: "Revenue within the last 18 months.",
  dormant: "Revenue before the 18-month window, nothing since.",
  closed: "HubSpot's own Closed lead status, mirrored here. Never set by the OS on its own.",
};

/**
 * The colour a stage wears, cool-to-warm along the funnel, and the same swatch
 * on the chip that the account carries anywhere else it is stated. Closed is
 * grey for the same reason HQ potential E is: gone is not a colder lead, it is
 * a different thing.
 */
export const LEAD_STAGE_COLOR: Record<LeadStage, string> = {
  prospect: "#4E7FA8",
  new_to_activate: "#C79A1E",
  active: "#3F7D4F",
  dormant: "#D97E2B",
  closed: "#8A928C",
};

// ---------------------------------------------------------------------------
// The state, the subject, the predicate
// ---------------------------------------------------------------------------

/**
 * Everything a chip needs to read off one account. Both screens build this
 * from what they already load, so neither has to widen its query to a shape
 * the other one needs.
 */
export type FilterSubject = {
  id: string;
  area: string | null;
  tier: Tier | null;
  readiness: Readiness | null;
  /** lib/priority.ts's 0-100 score. Null = not scored, never rendered as 0. */
  score: number | null;
  channel: string | null;
  leadStage: LeadStage | null;
};

/**
 * Empty set means UNFILTERED, never "nothing matches". That convention is
 * older than this file (the map's tier chips have worked this way since
 * 2026-08-02) and it is what lets one click narrow and a second click widen,
 * with no separate "all" control to hunt for.
 */
export type AccountFilterState = {
  areas: Set<string>;
  tiers: Set<Tier>;
  readiness: Set<ReadinessFilter>;
  /** The standalone 75+ chip. Independent of the readiness tags: a score is
   *  arithmetic over the book, a readiness tag is a rep's own read, and an
   *  account can carry either without the other. */
  hotScore: boolean;
  types: Set<AccountType>;
  stages: Set<LeadStage>;
};

export function emptyFilters(): AccountFilterState {
  return {
    areas: new Set(),
    tiers: new Set(),
    readiness: new Set(),
    hotScore: false,
    types: new Set(),
    stages: new Set(),
  };
}

export function activeFilterCount(f: AccountFilterState): number {
  return (
    f.areas.size + f.tiers.size + f.readiness.size + (f.hotScore ? 1 : 0) + f.types.size + f.stages.size
  );
}

/**
 * Every section narrows INDEPENDENTLY and the sections combine with AND.
 * "HQ potential A" plus "Palm Desert" plus "Dormant" asks for the A accounts
 * in Palm Desert that stopped buying, which is a real question; making one
 * section reset another would make it unaskable.
 *
 * WITHIN a section it is OR: Urgent and Hot both picked means either tag.
 * Readiness and 75+ score are two SEPARATE sections' worth of question living
 * in one row, so they are OR'd with each other too, not AND'd: Juan asking for
 * "Urgent or a 75+ score" is asking for one list of accounts worth calling
 * today, and AND would return the handful carrying both.
 */
export function matchesFilters(f: AccountFilterState, s: FilterSubject): boolean {
  if (f.areas.size > 0 && !(s.area !== null && f.areas.has(s.area))) return false;
  if (f.tiers.size > 0 && !(s.tier !== null && f.tiers.has(s.tier))) return false;

  const readinessAsked = f.readiness.size > 0 || f.hotScore;
  if (readinessAsked) {
    const byTag = s.readiness !== null && f.readiness.has(s.readiness as ReadinessFilter);
    const byScore = f.hotScore && typeof s.score === "number" && s.score >= HOT_SCORE_MIN;
    if (!byTag && !byScore) return false;
  }

  if (f.types.size > 0 && !f.types.has(accountType(s.channel))) return false;
  if (f.stages.size > 0 && !(s.leadStage !== null && f.stages.has(s.leadStage))) return false;
  return true;
}

/** Per-chip counts, computed over the SAME subject list every chip is offered
 *  from, so a chip never reads a count the screen behind it cannot produce. */
export type FilterCounts = {
  areas: Record<string, number>;
  tiers: Record<string, number>;
  readiness: Record<string, number>;
  hotScore: number;
  types: Record<string, number>;
  stages: Record<string, number>;
};

/**
 * Counted over the whole (display-narrowed) subject list, NOT over the current
 * selection. Each chip answers "how many of X are there", so X's own count has
 * to stay whole for every other chip to still make sense picked alongside it.
 * Same rule the map's badges have followed since 2026-08-06.
 */
export function countSubjects(subjects: FilterSubject[]): FilterCounts {
  const counts: FilterCounts = {
    areas: {},
    tiers: {},
    readiness: {},
    hotScore: 0,
    types: {},
    stages: {},
  };
  for (const s of subjects) {
    if (s.area) counts.areas[s.area] = (counts.areas[s.area] ?? 0) + 1;
    if (s.tier) counts.tiers[s.tier] = (counts.tiers[s.tier] ?? 0) + 1;
    if (s.readiness) counts.readiness[s.readiness] = (counts.readiness[s.readiness] ?? 0) + 1;
    if (typeof s.score === "number" && s.score >= HOT_SCORE_MIN) counts.hotScore += 1;
    const t = accountType(s.channel);
    counts.types[t] = (counts.types[t] ?? 0) + 1;
    if (s.leadStage) counts.stages[s.leadStage] = (counts.stages[s.leadStage] ?? 0) + 1;
  }
  return counts;
}
