/**
 * Data Access Layer for /nutribiotic.
 *
 * THE ONLY PLACE THIS APP TOUCHES SUPABASE. No page, no component, and no action
 * constructs a client of its own.
 *
 * Per Next 16's `02-guides/data-security.md`: one data-fetching approach, one
 * door, one place to audit.
 *
 * ACCESS: open, by decision 2026-07-20. The PIN gate was removed outright (not
 * just switched off) — anyone with the URL can read these pages. The noindex/
 * no-frame headers in proxy.ts keep it out of search results, but they are not
 * access control. If a gate is ever wanted again, rebuild it here in the DAL
 * first (per Next's authentication guide), never in Proxy alone.
 *
 * KEY HANDLING: this holds the SERVICE-ROLE key, server-side only. The anon key
 * is never shipped to the browser at all. For a single-user tool, browser-side
 * RLS buys nothing, and a publishable key sitting on a public domain would be
 * pure liability. Consequence, accepted deliberately: no browser Realtime. The
 * route page polls instead.
 *
 * ORIGIN DISCRIMINATION: every read returns a tagged union, `Result<T>`, which a
 * component cannot destructure without handling the mode. That makes "render fake
 * data as real" a TypeScript error rather than a lint warning or a habit. A query
 * whose rows span more than one origin THROWS rather than returning, because a
 * mixed list is the one case where a row could be mistaken for its neighbour.
 */

import "server-only";
import { cache } from "react";

const SB_URL = process.env.NB_SUPABASE_URL ?? "";
const SB_KEY = process.env.NB_SUPABASE_SERVICE_ROLE_KEY ?? "";

export type Origin = "synthetic" | "hubspot" | "excel_import" | "manual" | "enriched";
export type Mode = "synthetic" | "real" | "empty";

/**
 * A tagged result. The `mode` field is not decoration: because it is part of the
 * type, `data` cannot be reached without acknowledging what the data IS.
 */
export type Result<T> = {
  mode: Mode;
  data: T[];
  origins: Origin[];
};

export class MixedOriginError extends Error {
  constructor(table: string, origins: string[]) {
    super(
      `Refusing to return a mixed-origin result set from "${table}" (found: ${origins.join(", ")}). ` +
        `Synthetic and real rows must never be rendered in the same list, because a row ` +
        `adjacent to real data reads as real. Filter by origin at the query.`,
    );
    this.name = "MixedOriginError";
  }
}

export const isConfigured = (): boolean => Boolean(SB_URL && SB_KEY);

type QueryOpts = Record<string, string | number | undefined>;

async function query<T extends { origin?: Origin }>(
  table: string,
  opts: QueryOpts = {},
): Promise<Result<T>> {
  if (!isConfigured()) {
    // Degrade honestly. An unconfigured backend returns nothing; it never
    // fabricates a plausible-looking empty state that implies real emptiness.
    return { mode: "empty", data: [], origins: [] };
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined) params.set(k, String(v));
  }

  const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Supabase ${table} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as T[];
  const origins = [...new Set(data.map((r) => r.origin).filter(Boolean))] as Origin[];

  if (origins.length > 1) throw new MixedOriginError(table, origins);

  const mode: Mode =
    origins.length === 0 ? "empty" : origins[0] === "synthetic" ? "synthetic" : "real";

  return { mode, data, origins };
}

/**
 * Whether the workspace as a whole is showing synthetic data.
 *
 * Drives the app-wide chrome. Deliberately a WORKSPACE-level question rather
 * than a per-row badge: row badges get visually banked out within a week, while
 * a hazard-striped viewport and a `[SYNTHETIC]` title prefix survive a cropped
 * screenshot, which is how these numbers actually escape into a conversation.
 */
export const workspaceMode = cache(async (): Promise<Mode> => {
  if (!isConfigured()) return "empty";
  const res = await query<{ origin: Origin }>("nb_accounts", { select: "origin", limit: 1 });
  return res.mode;
});

// ---------------------------------------------------------------------------
// Domain reads
// ---------------------------------------------------------------------------

export type TierRow = {
  account_id: string;
  name: string;
  lifecycle: string;
  fit: number;
  fit_confidence: number;
  fit_inputs_known: number | null;
  fit_inputs_total: number | null;
  engagement: number;
  tier: "A" | "B" | "C" | "D";
  origin: Origin;
};

/**
 * Accounts ranked for the accounts screen.
 *
 * DEFAULT SORT IS (tier, confidence desc), NOT fit desc. That ordering is a
 * mitigation, not a preference: at seed most fit scores are computed from one or
 * two measured inputs, and a list sorted purely by value would present a
 * confidently-ranked pile of noise as a work queue.
 */
export async function listAccounts(limit = 500): Promise<Result<TierRow>> {
  return query<TierRow>("nb_v_account_tier", {
    select: "*",
    order: "tier.asc,fit_confidence.desc,fit.desc",
    limit,
  });
}

export type CadenceRow = {
  account_id: string;
  name: string;
  tier: "A" | "B" | "C" | "D";
  fit: number;
  fit_confidence: number;
  fit_inputs_known: number | null;
  fit_inputs_total: number | null;
  last_visit: string | null;
  last_inbound: string | null;
  never_visited: boolean;
  visit_days_overdue: number | null;
  email_days_overdue: number | null;
  origin: Origin;
};

/**
 * Cadence nudges. Suggestions only, never tasks. Nothing here has a status.
 *
 * Includes NEVER-VISITED accounts alongside overdue ones. Filtering on
 * visit_days_overdue > 0 alone silently hid every new prospect, because a store
 * you have never walked into has no overdue count to compute. Right now those
 * are the entire work queue, so hiding them emptied the one screen that is
 * supposed to say what to do today.
 */
export async function listCadenceDue(limit = 40): Promise<Result<CadenceRow>> {
  return query<CadenceRow>("nb_v_cadence_due", {
    select: "*",
    or: "(never_visited.is.true,visit_days_overdue.gt.0)",
    order: "tier.asc,never_visited.desc,visit_days_overdue.desc.nullslast",
    limit,
  });
}

export type StaleDeal = {
  deal_id: string;
  account_id: string;
  account_name: string;
  stage: string;
  next_step: string | null;
  next_step_date: string | null;
  next_step_days_overdue: number | null;
  days_since_activity: number | null;
  tier: "A" | "B" | "C" | "D" | null;
  origin: Origin;
};

/** Feeds the weekly review ritual: what has gone quiet and needs killing or reviving. */
export async function listStaleDeals(limit = 50): Promise<Result<StaleDeal>> {
  return query<StaleDeal>("nb_v_pipeline_stale", {
    select: "*",
    order: "next_step_days_overdue.desc.nullslast",
    limit,
  });
}

export type Deal = {
  id: string;
  account_id: string;
  stage: string;
  amount_cents: number | null;
  next_step: string | null;
  next_step_date: string | null;
  origin: Origin;
};

export async function listDeals(limit = 300): Promise<Result<Deal>> {
  return query<Deal>("nb_deals", { select: "*", order: "next_step_date.asc.nullslast", limit });
}

export type Account = {
  id: string;
  name: string;
  channel: string;
  street: string | null;
  city: string | null;
  postal: string | null;
  phone: string | null;
  lifecycle: string;
  last_order_at: string | null;
  lifetime_revenue: number | null;
  trailing_12m_revenue: number | null;
  expected_reorder_at: string | null;
  quirks: string | null;
  current_state: string | null;
  future_state: string | null;
  impact: string | null;
  business_hours: Record<string, string[][]> | null;
  origin: Origin;
};

export async function getAccount(id: string): Promise<Result<Account>> {
  return query<Account>("nb_accounts", { select: "*", id: `eq.${id}`, limit: 1 });
}

export type Activity = {
  id: number;
  account_id: string;
  at: string;
  kind: string;
  direction: string;
  outcome: string | null;
  detail: string | null;
  origin: Origin;
};

export async function listActivities(accountId: string, limit = 60): Promise<Result<Activity>> {
  return query<Activity>("nb_activities", {
    select: "*",
    account_id: `eq.${accountId}`,
    order: "at.desc",
    limit,
  });
}

export type SupportIssue = {
  id: string;
  account_id: string;
  raised_at: string;
  issue_type: string;
  summary: string;
  status: "open" | "forwarded" | "closed_by_hq";
  forwarded_at: string | null;
  origin: Origin;
};

export async function listSupportIssues(limit = 100): Promise<Result<SupportIssue>> {
  return query<SupportIssue>("nb_support_issues", {
    select: "*",
    order: "raised_at.desc",
    limit,
  });
}

export type Draft = {
  id: string;
  account_id: string | null;
  channel: string;
  subject: string | null;
  body_md: string;
  play_key: string | null;
  status: string;
  created_at: string;
  origin: Origin;
};

export async function listDrafts(limit = 100): Promise<Result<Draft>> {
  return query<Draft>("nb_outbound_drafts", {
    select: "*",
    status: "eq.pending",
    order: "created_at.desc",
    limit,
  });
}

export type RevenueMonth = {
  month: string;
  origin: Origin;
  revenue: number;
  order_count: number;
  active_accounts: number;
  source_coverage_pct: number | null;
};

export async function revenueByMonth(): Promise<Result<RevenueMonth>> {
  return query<RevenueMonth>("nb_v_kpi_revenue_monthly", { select: "*", order: "month.desc", limit: 24 });
}

export type Reactivation = {
  origin: Origin;
  accounts_with_trial: number;
  accounts_reactivated: number;
  trial_to_reorder_pct: number | null;
  avg_days_trial_to_reorder: number | null;
};

export async function reactivation(): Promise<Result<Reactivation>> {
  return query<Reactivation>("nb_v_kpi_reactivation", { select: "*" });
}

export type LeadingDay = {
  day: string;
  origin: Origin;
  visits: number;
  calls: number;
  emails_out: number;
  samples_dropped: number;
  staff_trainings: number;
  meetings: number;
  replies_in: number;
  accounts_visited: number;
};

export async function leadingDaily(days = 30): Promise<Result<LeadingDay>> {
  return query<LeadingDay>("nb_v_kpi_leading_daily", { select: "*", order: "day.desc", limit: days });
}
