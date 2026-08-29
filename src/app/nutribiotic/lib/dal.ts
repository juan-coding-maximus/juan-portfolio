/**
 * Data Access Layer for /nutribiotic.
 *
 * THE ONLY PLACE THIS APP TOUCHES SUPABASE. No page, no component, and no action
 * constructs a client of its own.
 *
 * Two reasons, both from Next 16's own docs shipped in node_modules:
 *
 *  1. `02-guides/authentication.md` recommends centralizing authorization in a
 *     DAL and warns that Proxy must NOT be the gate (it runs on every route
 *     including prefetches, so it may only read the cookie). `verifySession()`
 *     here, wrapped in React `cache()`, is the real gate and runs at the top of
 *     every query.
 *  2. `02-guides/data-security.md` warns against mixing data-fetching approaches.
 *     One door means one place to audit.
 *
 * ACCESS: PIN-gated again as of 2026-08-10 (was removed outright 2026-07-20;
 * reinstated at Juan's direction after the OS accumulated real customer data
 * and a live weekly route/location plan, both openly reachable by anyone with
 * the URL in the meantime). verifySession() below is the actual gate; proxy.ts
 * only bounces the obvious case before a page even renders.
 *
 * KEY HANDLING: this holds the SERVICE-ROLE key, server-side only. The anon key
 * is never shipped to the browser at all. With a single PIN user, browser-side
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
import { redirect } from "next/navigation";
import { hasAccess } from "./devices";
import { hasWidgetToken } from "./session";

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

/**
 * The real authorization gate. Called at the top of every query and mutation
 * below. `cache()` memoizes it for the duration of one render pass, per the
 * Next 16 auth guide, so many queries on one page do not repeat the check.
 */
export const verifySession = cache(async (): Promise<true> => {
  /* hasAccess, not hasValidSession, since 2026-08-17: a PIN session OR a
     remembered device (devices.ts). This is also where a REVOKED device is
     stopped — proxy.ts checks that cookie's signature and nothing else, because
     Proxy may not touch a database, so revocation has to be enforced by the gate
     that guards the data rather than by the one that guards the route. */
  if (!(await hasAccess())) redirect("/nutribiotic/gate");
  return true;
});

/**
 * The gate on reads, which is the same gate plus one narrower key: the home
 * screen widget's NB_WIDGET_TOKEN (see session.ts). Split from verifySession
 * rather than folded into it so the widget's bearer can never reach mutate(),
 * which still demands a real session. A read-only token is only read-only if
 * something enforces it.
 */
const verifyReadAccess = cache(async (): Promise<true> => {
  if (await hasWidgetToken()) return true;
  return verifySession();
});

type QueryOpts = Record<string, string | number | undefined>;

async function query<T extends { origin?: Origin }>(
  table: string,
  opts: QueryOpts = {},
): Promise<Result<T>> {
  await verifyReadAccess();

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

  // The guarantee this guards is specifically synthetic-vs-real (a synthetic row
  // reading as real because it sits next to one). It is not a rule against real
  // data having more than one real origin: 'enriched' (the seeded/researched
  // accounts) and 'manual' (what Juan logs by hand, e.g. a touchpoint) are both
  // real, and a daily rollup view legitimately returns rows in both.
  if (origins.includes("synthetic") && origins.length > 1) throw new MixedOriginError(table, origins);

  const mode: Mode =
    origins.length === 0 ? "empty" : origins.includes("synthetic") ? "synthetic" : "real";

  return { mode, data, origins };
}

/**
 * The write half of the one door. Same key, same table namespace as `query()`.
 * Every write this app makes is Juan's own field data (an activity he logged,
 * a contact detail he stated, a calendar proposal he is about to approve),
 * never a fabricated fact, so there is no origin-mixing concern here the way
 * there is on reads: every row this writes is `origin: 'manual'`.
 */
async function mutate<T>(
  table: string,
  method: "POST" | "PATCH",
  body: unknown,
  opts: QueryOpts = {},
  /** Overrides the default return=representation. The one caller that needs
   *  this is the report-draft upsert, which asks PostgREST to merge on the
   *  primary key rather than fail on a row that already exists. */
  prefer = "return=representation",
): Promise<T[]> {
  await verifySession();

  if (!isConfigured()) {
    throw new Error(`Cannot write to "${table}": no data source configured.`);
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined) params.set(k, String(v));
  }

  const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Supabase ${table} ${method} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  return (await res.json()) as T[];
}

/** Our own id shape throughout this schema: '<prefix>_<6 hex>'. */
function randId(prefix: string): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
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
  await verifySession();
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
  area: string | null;
  hubspot_owner_id: string | null;
  chain_excluded: boolean;
  practice_excluded: boolean;
};

/**
 * Accounts ranked for the accounts screen.
 *
 * DEFAULT SORT IS (tier, confidence desc), NOT fit desc. That ordering is a
 * mitigation, not a preference: at seed most fit scores are computed from one or
 * two measured inputs, and a list sorted purely by value would present a
 * confidently-ranked pile of noise as a work queue.
 */
export async function listAccounts(
  opts: { area?: string | null; limit?: number; sort?: "tier" | "engagement" } = {},
): Promise<Result<TierRow>> {
  /* SCOPED TO JUAN'S BOOK, and this is a correction rather than a feature. The page
     is titled "Territory" and was showing all 459 CA accounts: 118 of them are in
     another rep's book and 68 are unowned prospects nobody has sold to. A count that
     includes accounts you do not carry is not a territory, and it made every tier
     total on the page wrong by 68%. */
  /* CHAIN- AND PRACTICE-EXCLUDED ACCOUNTS ARE LEFT OUT HERE TOO, no toggle on
     this page. The map has the "chains"/"practices" buttons because that is
     where Juan asked for them; the Territory/Clients list is a work queue in
     the same spirit as cadence, and neither a Whole Foods nor a lone
     chiropractor's office has business occupying a row on it. Undoing this
     needs exclude_chains.py/exclude_practices.py --undo, not a click. */
  const params: Record<string, string | number> = {
    select: "*",
    hubspot_owner_id: `eq.${JUAN_OWNER_ID}`,
    chain_excluded: "eq.false",
    practice_excluded: "eq.false",
    // And closed businesses, which are not a work queue at all (0026).
    closed_at: "is.null",
    // And waypoints, which are not customers at all (0029): Juan's apartment
    // is on the map to be routed through, not counted as territory.
    lifecycle: "neq.waypoint",
    // "Most engaged" is a Juan-requested override, not a second default: it drops
    // OS tier as the primary key entirely, so an under-known A can sit below a
    // well-measured D. Fine for "who's actually talking to me right now", wrong
    // as the resting order of a work queue.
    order:
      opts.sort === "engagement"
        ? "engagement.desc.nullslast,tier.asc"
        : "tier.asc,fit_confidence.desc,fit.desc",
    limit: opts.limit ?? 500,
  };
  if (opts.area) params.area = `eq.${opts.area}`;
  return query<TierRow>("nb_v_account_tier", params);
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
  website: string | null;
  email: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
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
  /** HubSpot company record id. Null = this account has no company in the portal. */
  hubspot_company_id: string | null;
  /** HQ's own potential grade (HubSpot's potential__cloned_), pull-only, A-G with a label ("B - medium"). See ui.tsx's TierChip. */
  potential_hq: string | null;
  /** Juan's own read of potential, A-G, set by hand on the account card (migration 0039). A non-null value is picked up within a minute by bridges/nutribiotic/hubspot_sync.py's --watch loop and pushed onto HubSpot's potential__cloned_, overwriting HQ's grade there (hubspot_fields.json's potential_juan entry, 2026-08-21); clearing stays local only, the loop never fires on null. */
  potential_juan: Tier | null;
  origin: Origin;
};

export async function getAccount(id: string): Promise<Result<Account>> {
  return query<Account>("nb_accounts", { select: "*", id: `eq.${id}`, limit: 1 });
}

/** Sets or clears Juan's own potential read (see Account.potential_juan). Local only, in nb_accounts; never touches HubSpot itself, see the column's own comment above for how it gets there. */
export async function setAccountPotentialJuan(id: string, grade: Tier | null): Promise<Account | null> {
  const rows = await mutate<Account>("nb_accounts", "PATCH", { potential_juan: grade }, { id: `eq.${id}` });
  return rows[0] ?? null;
}

export type AccountFactsReport = {
  business_hours: { status: "filled" } | { status: "conflict"; existing: Record<string, string[][]> } | null;
  phone: { status: "filled"; value: string } | { status: "conflict"; existing: string } | null;
  email: { status: "filled"; value: string } | { status: "conflict"; existing: string } | null;
};

/**
 * Blank-fill nb_accounts.business_hours/phone/email from what was stated
 * about the BUSINESS during a visit (AGENTS.md HARD RULE 14). Re-reads the
 * live row first, same as every other write in this file, a concurrent
 * enrichment pass may have filled the cell in the minutes since this
 * touchpoint started. Never overwrites an existing value; a disagreement is
 * reported, not resolved, same shape as ensureCompanyPhone's report.
 */
export async function applyAccountFacts(
  accountId: string,
  facts: { business_hours: Record<string, string[][]> | null; phone: string | null; email: string | null },
): Promise<AccountFactsReport> {
  const report: AccountFactsReport = { business_hours: null, phone: null, email: null };
  const hasAnyHours = facts.business_hours && Object.values(facts.business_hours).some((w) => w.length > 0);
  if (!hasAnyHours && !facts.phone && !facts.email) return report;

  const current = await getAccount(accountId);
  const row = current.data[0];
  if (!row) return report;

  const patch: Record<string, unknown> = {};

  if (hasAnyHours) {
    if (!row.business_hours) {
      patch.business_hours = facts.business_hours;
      report.business_hours = { status: "filled" };
    } else {
      report.business_hours = { status: "conflict", existing: row.business_hours };
    }
  }
  if (facts.phone) {
    if (!row.phone) {
      patch.phone = facts.phone;
      report.phone = { status: "filled", value: facts.phone };
    } else if (row.phone !== facts.phone) {
      report.phone = { status: "conflict", existing: row.phone };
    }
  }
  if (facts.email) {
    if (!row.email) {
      patch.email = facts.email;
      report.email = { status: "filled", value: facts.email };
    } else if (row.email !== facts.email) {
      report.email = { status: "conflict", existing: row.email };
    }
  }

  if (Object.keys(patch).length > 0) {
    await mutate<Account>("nb_accounts", "PATCH", patch, { id: `eq.${accountId}` });
  }
  return report;
}

export type NewAccount = {
  name: string;
  channel?: string;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website?: string | null;
  business_hours?: Record<string, string[][]> | null;
};

/** A genuinely new business, created from the field (Visit tab), not from the
 * ERP intake pipeline. Only `id` and `name` are required by the schema
 * (migration 0002); everything else here is what Google Places returned, so
 * an account created this way starts already enriched rather than blank. */
export async function insertAccount(input: NewAccount): Promise<Account> {
  const [row] = await mutate<Account>("nb_accounts", "POST", {
    id: randId("a"),
    origin: "manual",
    ...input,
  });
  return row;
}

/** Write-once link from an OS account to the portal company just created for
 * it, guarded the same way stampActivityEngagementId is: the is.null filter
 * means a race can only ever set this once. Mirrors
 * hubspot_create_company.py's post-create PATCH (owner filled immediately
 * rather than waiting for the next sync, since the OS is not guessing the
 * portal's state here, it just set it). */
export async function linkAccountHubspotCompany(
  accountId: string,
  companyId: string,
  ownerId: string,
  ownerName: string,
): Promise<Account | null> {
  const rows = await mutate<Account>(
    "nb_accounts",
    "PATCH",
    { hubspot_company_id: companyId, hubspot_owner_id: ownerId, owner_name: ownerName },
    { id: `eq.${accountId}`, hubspot_company_id: "is.null" },
  );
  return rows[0] ?? null;
}

export type Contact = {
  id: string;
  account_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  role_tag: string | null;
  is_decision_maker: boolean;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  hubspot_contact_id: string | null;
  origin: Origin;
};

/** Named people at an account: owner, manager, director, buyer. */
export async function listContacts(accountId: string): Promise<Result<Contact>> {
  return query<Contact>("nb_contacts", {
    select: "*",
    account_id: `eq.${accountId}`,
    order: "is_decision_maker.desc,last_name.asc",
  });
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

/** The full row, for the HubSpot engagement port (mirrors hubspot_notes.py's
 * ACTIVITY_COLS). listActivities()/Activity above stays narrow because most
 * callers never need contact_id/hubspot_engagement_id/actor/logged_at. */
export type EngagementActivity = {
  id: number;
  account_id: string;
  contact_id: string | null;
  at: string | null;
  logged_at: string | null;
  kind: string;
  direction: string;
  actor: string | null;
  outcome: string | null;
  detail: string | null;
  hubspot_engagement_id: string | null;
  origin: Origin;
};

export async function getActivityById(id: number): Promise<EngagementActivity | null> {
  const res = await query<EngagementActivity>("nb_activities", {
    select: "id,account_id,contact_id,at,logged_at,kind,direction,actor,outcome,detail,hubspot_engagement_id,origin",
    id: `eq.${id}`,
    limit: 1,
  });
  return res.data[0] ?? null;
}

/** Activities Juan has logged (any door) that have never crossed into HubSpot,
 * for the Visit tab's filing queue. Synthetic rows are excluded at the query
 * rather than left for the caller to filter, same rule hubspot_notes.py's
 * own synthetic guard enforces at write time. */
export async function listUnfiledActivities(limit = 20): Promise<Result<EngagementActivity>> {
  return query<EngagementActivity>("nb_activities", {
    select: "id,account_id,contact_id,at,logged_at,kind,direction,actor,outcome,detail,hubspot_engagement_id,origin",
    hubspot_engagement_id: "is.null",
    account_id: "not.is.null",
    origin: "neq.synthetic",
    order: "at.desc",
    limit,
  });
}

/** Write-once stamp, mirrors hubspot_notes.py's stamp(): the is.null filter is
 * belt-and-braces with the DB trigger (migration 0002:236-247) that already
 * rejects a second write. Returns the row if this call did the stamping,
 * null if another had already landed first (not an error, just a race). */
export async function stampActivityEngagementId(
  activityId: number,
  engagementId: string,
): Promise<EngagementActivity | null> {
  const rows = await mutate<EngagementActivity>(
    "nb_activities",
    "PATCH",
    { hubspot_engagement_id: engagementId },
    { id: `eq.${activityId}`, hubspot_engagement_id: "is.null" },
  );
  return rows[0] ?? null;
}

/** Narrow projection for the HubSpot boundary, mirrors hubspot_notes.py's
 * resolve_account(). The broad Account type (used by the profile page) is
 * left alone; this exists so a scope check never has to over-fetch. */
export type EngagementAccount = {
  id: string;
  name: string;
  hubspot_company_id: string | null;
  owner_name: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  origin: Origin;
};

export async function getAccountForEngagement(id: string): Promise<EngagementAccount | null> {
  const res = await query<EngagementAccount>("nb_accounts", {
    select: "id,name,hubspot_company_id,owner_name,website,phone,email,origin",
    id: `eq.${id}`,
    limit: 1,
  });
  return res.data[0] ?? null;
}

export type PurchaseOrder = {
  id: string;
  ordered_at: string;
  revenue_cents: number;
  order_type: string;
  origin: Origin;
};

export type PurchaseLine = {
  id: string;
  order_id: string;
  product_name: string | null;
  qty: number | null;
  line_revenue_cents: number;
  origin: Origin;
};

/**
 * Full order history with what was actually on it, for the account profile.
 * Only 146 of 459 accounts have any loaded order history (nb_order_lines, see
 * migration 0015); accounts without it get an empty result, not a zero-filled
 * one. Two queries rather than one PostgREST embed: ordering top-level rows by
 * an embedded resource's column isn't reliable across PostgREST versions, and
 * this is only ever a handful of orders per account. limit is generous
 * headroom, not a display cap — the profile aggregates across every order to
 * rank items by lifetime units, so silently dropping the oldest orders would
 * silently wrong that ranking.
 */
export async function listPurchases(
  accountId: string,
  limit = 500,
): Promise<{ orders: PurchaseOrder[]; lines: PurchaseLine[] }> {
  const orders = await query<PurchaseOrder>("nb_orders", {
    select: "id,ordered_at,revenue_cents,order_type,origin",
    account_id: `eq.${accountId}`,
    order: "ordered_at.desc",
    limit,
  });
  if (orders.data.length === 0) return { orders: [], lines: [] };

  const ids = orders.data.map((o) => o.id).join(",");
  const lines = await query<PurchaseLine>("nb_order_lines", {
    select: "id,order_id,product_name,qty,line_revenue_cents,origin",
    order_id: `in.(${ids})`,
  });
  return { orders: orders.data, lines: lines.data };
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
  to_email: string | null;
  to_name: string | null;
  play_key: string | null;
  status: string;
  created_at: string;
  /** 2 urgent · 1 soon · 0 low · null not yet read against the notes.
   * Set by bridges/nutribiotic/draft_urgency.py from what the account's
   * HubSpot notes/calls/meetings actually say, never from this row's own
   * subject line. `urgency_reason` carries the evidence. */
  urgency: number | null;
  urgency_reason: string | null;
  origin: Origin;
};

/**
 * The pending queue, most urgent first.
 *
 * WHY THE SORT IS HERE AND NOT IN THE QUERY. PostgREST rejects an `order` on a
 * column it cannot see with a 400, which would take the whole Outbound screen
 * down in any environment where 0035 has not been applied yet (or against the
 * migration target project, which is mid-move). Sorting the rows we already
 * hold cannot fail that way, and `Array.prototype.sort` is required to be
 * stable, so drafts inside a tier keep the `created_at desc` order the query
 * asked for — which is exactly the tiebreak we want.
 *
 * An UNGRADED draft (urgency null, e.g. one staged since the last grading run)
 * sorts BELOW `low` rather than being treated as low. "Nobody has read the
 * notes for this one yet" is a different statement from "the notes say there is
 * no hurry", and the queue should not launder the first into the second.
 */
export async function listDrafts(limit = 100): Promise<Result<Draft>> {
  const res = await query<Draft>("nb_outbound_drafts", {
    select: "*",
    status: "eq.pending",
    order: "created_at.desc",
    limit,
  });
  const rank = (d: Draft) => (typeof d.urgency === "number" ? d.urgency : -1);
  return { ...res, data: [...res.data].sort((a, b) => rank(b) - rank(a)) };
}

/** The account's single most recent draft, any status (pending, sent, or
 *  dismissed) — unlike listDrafts() this is not restricted to the open queue.
 *  Used by the outreach composer's prep step: before Juan drafts a fresh
 *  WhatsApp message, show whatever was drafted for this account last, so he
 *  isn't repeating himself or missing something already queued. */
export async function getLatestDraftForAccount(accountId: string): Promise<Draft | null> {
  const res = await query<Draft>("nb_outbound_drafts", {
    select: "*",
    account_id: `eq.${accountId}`,
    order: "created_at.desc",
    limit: 1,
  });
  return res.data[0] ?? null;
}

/** Juan clicked the compose link (or is dismissing a draft he won't send).
 * 'sent' is self-reported here — this mailbox holds no Mail.Send scope, so the
 * OS cannot verify a send; it only records that Juan says he did. */
export async function setDraftStatus(
  id: string,
  status: "sent" | "dismissed",
): Promise<Draft> {
  const patch: Record<string, unknown> = { status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  const [row] = await mutate<Draft>("nb_outbound_drafts", "PATCH", patch, { id: `eq.${id}` });
  return row;
}

// ---------------------------------------------------------------------------
// Writes. All Juan's own data: a note he typed, a detail he stated. Nothing
// here is fabricated, so every row lands as origin: 'manual'.
// ---------------------------------------------------------------------------

export type NewActivity = {
  account_id: string;
  contact_id?: string | null;
  kind: string;
  direction: string;
  outcome?: string | null;
  detail?: string | null;
  /** When it HAPPENED, if known and different from now. Omit to default to now(). */
  at?: string;
};

export async function insertActivity(input: NewActivity): Promise<Activity> {
  const [row] = await mutate<Activity>("nb_activities", "POST", {
    ...input,
    actor: "juan",
    origin: "manual",
  });
  return row;
}

/** Midnight today, America/Los_Angeles, as an ISO instant with the offset
 *  that actually applies right now (PST or PDT) -- computed from Intl rather
 *  than a hardcoded "-07:00" or "-08:00", so it stays correct across the
 *  March/November transitions without a yearly edit. */
function todayStartLA(): string {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => dateParts.find((p) => p.type === type)?.value ?? "";
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d+)(?::?(\d+))?/.exec(offsetPart ?? "");
  const offsetMin = m ? Number(m[1]) * 60 + (Number(m[1]) < 0 ? -1 : 1) * Number(m[2] ?? 0) : -480;
  const sign = offsetMin <= 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${get("year")}-${get("month")}-${get("day")}T00:00:00${offset}`;
}

/**
 * Where Juan physically was last, today (Juan's ask 2026-08-26): the account
 * behind the most recent activity logged since midnight, if that account has
 * a coordinate. Feeds new-account-actions.ts's Places search, on the theory a
 * business just logged for the first time is usually a few doors down from
 * wherever the rep already was, not somewhere else in the county.
 *
 * SAME DAY ONLY. A last touchpoint from yesterday says nothing about where
 * today's drive is, so this returns null rather than reaching backward past
 * midnight, and the caller falls back to the county-wide search it always had
 * (HARD RULE 1: the blank stays blank, nothing here guesses at a location).
 */
export async function getLastVisitedLocationToday(): Promise<{ lat: number; lng: number; name: string } | null> {
  await verifyReadAccess();
  if (!isConfigured()) return null;
  const recent = await query<{ account_id: string; at: string; origin?: Origin }>("nb_activities", {
    select: "account_id,at",
    at: `gte.${todayStartLA()}`,
    order: "at.desc",
    limit: 1,
  });
  const accountId = recent.data[0]?.account_id;
  if (!accountId) return null;
  const acc = await query<{ lat: number | null; lng: number | null; name: string; origin?: Origin }>("nb_accounts", {
    select: "lat,lng,name",
    id: `eq.${accountId}`,
    limit: 1,
  });
  const a = acc.data[0];
  if (!a || a.lat == null || a.lng == null) return null;
  return { lat: a.lat, lng: a.lng, name: a.name };
}

export type NewContact = {
  account_id: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  role_tag?: string | null;
  is_decision_maker?: boolean;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  hubspot_contact_id?: string | null;
};

export async function insertContact(input: NewContact): Promise<Contact> {
  const [row] = await mutate<Contact>("nb_contacts", "POST", {
    id: randId("c"),
    origin: "manual",
    ...input,
  });
  return row;
}

/** Fills blanks only. Never overwrites a field that already holds a value, so
 * a touchpoint parse can never clobber a detail entered a different way. */
export async function patchContact(id: string, patch: Partial<NewContact>): Promise<Contact> {
  const [row] = await mutate<Contact>("nb_contacts", "PATCH", patch, { id: `eq.${id}` });
  return row;
}

/** Stamp an OS contact with the HubSpot contact it was just matched or
 * created against, only if it did not already carry one. Mirrors
 * hubspot_notes.py's link step: guarded by the same is.null filter rather
 * than patchContact's unconditional write, since two engagement fills racing
 * on the same contact must not stamp two different ids. */
export async function linkContactHubspotId(id: string, hubspotContactId: string): Promise<Contact | null> {
  const rows = await mutate<Contact>(
    "nb_contacts",
    "PATCH",
    { hubspot_contact_id: hubspotContactId },
    { id: `eq.${id}`, hubspot_contact_id: "is.null" },
  );
  return rows[0] ?? null;
}

export type Touchpoint = {
  id: string;
  account_id: string | null;
  raw_text: string;
  status: string;
  account_match_confidence: string | null;
  activity_id: number | null;
  parsed: unknown;
  origin: Origin;
  created_at: string;
};

export async function insertTouchpoint(input: {
  account_id: string | null;
  raw_text: string;
  status: string;
  account_match_confidence?: string | null;
  activity_id?: number | null;
  parsed?: unknown;
}): Promise<Touchpoint> {
  const [row] = await mutate<Touchpoint>("nb_touchpoints", "POST", {
    id: randId("t"),
    origin: "manual",
    ...input,
  });
  return row;
}

/** The note body source is the activity row, never re-parsed; `parsed` here
 * is used only for the per-person detail in the engagement port's people
 * match, mirroring hubspot_notes.py's load_touchpoint(). */
export async function getTouchpointParsedForActivity(activityId: number): Promise<unknown> {
  const res = await query<Touchpoint>("nb_touchpoints", {
    select: "id,parsed,origin",
    activity_id: `eq.${activityId}`,
    limit: 1,
  });
  return res.data[0]?.parsed ?? null;
}

/**
 * Every touchpoint still parked as needs_account, oldest first (a rep reads
 * a queue top-down, same as the calendar-proposals list below it).
 *
 * WHY THIS EXISTS SEPARATELY FROM THE JUST-TYPED RESULT. The Visit tab's
 * TouchpointCapture only shows the AccountMatchResolver for the note Juan
 * just typed in that exact page load. A voice-recorded visit resolves
 * async, after transcription, on nobody's screen, so without this list it
 * parks invisibly until someone opens Claude Code and asks for it by hand
 * (confirmed 2026-08-19, t_345d5c). This list is what a recorded visit's
 * pending match surfaces on, same pills, same "YES!", same SuccessNote.
 */
export async function listPendingAccountMatches(limit = 10): Promise<Result<Touchpoint>> {
  return query<Touchpoint>("nb_touchpoints", {
    select: "id,account_id,raw_text,status,account_match_confidence,activity_id,parsed,origin,created_at",
    status: "eq.needs_account",
    order: "created_at.asc",
    limit,
  });
}

/** id -> name for a handful of accounts, to label a "Client Match:" pill
 * without pulling the whole 500-row book the way recordTouchpoint() does. */
export async function getAccountNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const res = await query<{ id: string; name: string; origin?: Origin }>("nb_accounts", {
    select: "id,name",
    id: `in.(${ids.join(",")})`,
  });
  return Object.fromEntries(res.data.map((a) => [a.id, a.name]));
}

/**
 * The Outlook poller's atomic claim on one Graph message id (see migration
 * 0038). The INSERT itself is the dedup guard: nb_email_poll_log.message_id
 * carries a bare unique index, so a second claim of the same message, from an
 * overlapping poller run after a laptop sleep/wake or a retried request,
 * fails at the database rather than risking a second HubSpot filing. `status`
 * starts as 'error' and is corrected by updateEmailPollLog once the caller
 * knows the real outcome; a process that crashes between the two leaves an
 * honest 'error' row rather than a silently-abandoned claim that never
 * resolves either way.
 */
export async function claimEmailMessage(input: {
  message_id: string;
  sent_at: string;
  direction: "outbound" | "inbound";
  to_addresses: string[];
}): Promise<{ claimed: boolean; id: number | null }> {
  await verifySession();
  if (!isConfigured()) {
    throw new Error("Cannot write to nb_email_poll_log: no data source configured.");
  }

  const res = await fetch(`${SB_URL}/rest/v1/nb_email_poll_log`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ ...input, status: "error" }),
  });

  if (res.status === 409) return { claimed: false, id: null };
  if (!res.ok) {
    throw new Error(
      `Supabase nb_email_poll_log POST -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const [row] = (await res.json()) as { id: number }[];
  return { claimed: true, id: row.id };
}

export async function updateEmailPollLog(
  id: number,
  patch: {
    status: "filed" | "skipped_no_match" | "skipped_ambiguous" | "skipped_not_juans_book" | "error";
    matched_account_id?: string | null;
    matched_contact_id?: string | null;
    activity_id?: number | null;
    hubspot_note_id?: string | null;
    error?: string | null;
  },
): Promise<void> {
  await mutate("nb_email_poll_log", "PATCH", patch, { id: `eq.${id}` });
}

/**
 * The poller's cursor: the newest sent_at it has already claimed, so a run
 * only asks Graph for messages after this point instead of re-fetching (and
 * re-claiming, no-op or not) the whole Sent folder every 10 minutes. Derived
 * from the log itself rather than stored separately, same "don't keep a
 * second copy of a fact a table already determines" reasoning as 0037's route
 * schedule.
 */
export async function latestEmailPollCursor(): Promise<string | null> {
  const rows = await raw<{ sent_at: string }>(
    `nb_email_poll_log?select=sent_at&order=sent_at.desc&limit=1`,
  );
  return rows[0]?.sent_at ?? null;
}

/**
 * Match a Sent email's recipients to Juan's book WITHOUT guessing. Exact
 * contact-email match only, never a domain match: a shared/chain domain
 * (2026-08-17, lazyacres.com) is exactly how a wrong-owner company got
 * silently linked in HubSpot from a matching heuristic, and code doing that
 * unattended every 10 minutes is at least as dangerous as a human typing a
 * new contact by hand. Zero matched accounts, more than one distinct matched
 * account, an account outside Juan's book, or an account never linked to a
 * real HubSpot company all come back null: "no confident match" is a finding
 * the poller skips and logs, never a guess it files. This is scope check #1
 * of 2 -- runEngagement's assertJuansBook re-verifies live against HubSpot
 * before anything is actually written, same as every other capture door.
 *
 * Match is exact-string, not case-folded server-side: a casing mismatch
 * between how a contact's email was entered and how Outlook renders it
 * produces a missed match (skipped_no_match), never a wrong one. That is the
 * safe direction to fail in.
 */
export async function resolveAccountForEmail(
  addresses: string[],
): Promise<{ account_id: string; contact_id: string } | null> {
  const clean = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (clean.length === 0) return null;

  const contacts = await raw<{ id: string; account_id: string; email: string | null }>(
    `nb_contacts?select=id,account_id,email&email=in.(${clean.map((a) => encodeURIComponent(a)).join(",")})`,
  );
  if (contacts.length === 0) return null;

  const accountIds = [...new Set(contacts.map((c) => c.account_id))];
  if (accountIds.length !== 1) return null; // two different companies on one email: ambiguous, not a coin flip

  const [accountId] = accountIds;
  const [account] = await raw<{ id: string; hubspot_owner_id: string | null; hubspot_company_id: string | null }>(
    `nb_accounts?select=id,hubspot_owner_id,hubspot_company_id&id=eq.${accountId}`,
  );
  if (!account) return null;
  if (account.hubspot_owner_id !== JUAN_OWNER_ID) return null;
  if (!account.hubspot_company_id) return null; // never linked to a real portal company; nothing to file to

  return { account_id: accountId, contact_id: contacts[0].id };
}

export async function getTouchpointById(id: string): Promise<Touchpoint | null> {
  const res = await query<Touchpoint>("nb_touchpoints", {
    select: "*",
    id: `eq.${id}`,
    limit: 1,
  });
  return res.data[0] ?? null;
}

/** Once a needs_account touchpoint has an account (Juan confirmed a match or
 * a just-created business), stamp it filed. Guarded to never re-file a
 * touchpoint that already has one. */
export async function finalizeTouchpointAccount(
  id: string,
  accountId: string,
  activityId: number,
): Promise<Touchpoint | null> {
  const rows = await mutate<Touchpoint>(
    "nb_touchpoints",
    "PATCH",
    { account_id: accountId, status: "parsed", activity_id: activityId },
    { id: `eq.${id}`, status: "eq.needs_account" },
  );
  return rows[0] ?? null;
}

export type CalendarProposal = {
  id: string;
  touchpoint_id: string | null;
  account_id: string | null;
  account_name?: string;
  kind: "meeting" | "reminder" | "visit";
  title: string;
  starts_at: string | null;
  duration_minutes: number;
  notes: string | null;
  status: "pending" | "approved" | "dismissed" | "created";
  gcal_event_id: string | null;
  origin: Origin;
  created_at: string;
};

export async function insertCalendarProposal(input: {
  touchpoint_id: string | null;
  account_id: string | null;
  kind: "meeting" | "reminder" | "visit";
  title: string;
  starts_at: string | null;
  duration_minutes?: number;
  notes?: string | null;
}): Promise<CalendarProposal> {
  const [row] = await mutate<CalendarProposal>("nb_calendar_proposals", "POST", {
    id: randId("cp"),
    status: "pending",
    origin: "manual",
    ...input,
  });
  return row;
}

/** Pending follow-ups, oldest-starting first. This is the human gate: nothing
 * here has touched Google Calendar yet. */
export async function listCalendarProposals(limit = 20): Promise<Result<CalendarProposal>> {
  return query<CalendarProposal>("nb_calendar_proposals", {
    select: "*",
    status: "eq.pending",
    order: "starts_at.asc.nullslast,created_at.asc",
    limit,
  });
}

export async function setCalendarProposalStatus(
  id: string,
  status: "approved" | "dismissed",
): Promise<CalendarProposal> {
  const [row] = await mutate<CalendarProposal>(
    "nb_calendar_proposals",
    "PATCH",
    { status, decided_at: new Date().toISOString() },
    { id: `eq.${id}` },
  );
  return row;
}

// ---------------------------------------------------------------------------
// Voice-recorded visits. A rep taps Record instead of typing; the audio lands
// in storage and rides the exact same recordTouchpoint() extraction once the
// Mac-side transcriber (bridges/nutribiotic/visits.py, sharing bridges/lib/stt.py
// with the JobHunt meetings recorder) has produced text. See migration 0012.
// ---------------------------------------------------------------------------

const VISIT_AUDIO_BUCKET = "nb-visit-audio";

export type VisitRecording = {
  id: string;
  account_id_hint: string | null;
  audio_path: string;
  status: "uploaded" | "transcribed" | "processed" | "error";
  transcript: string | null;
  touchpoint_id: string | null;
  error: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

/** Uploads raw audio bytes to the private visit-audio bucket. Returns the storage path. */
export async function uploadVisitAudio(bytes: ArrayBuffer, contentType: string, ext: string): Promise<string> {
  await verifySession();
  if (!isConfigured()) throw new Error("Cannot upload audio: no data source configured.");
  const path = `${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}.${ext}`;

  const res = await fetch(`${SB_URL}/storage/v1/object/${VISIT_AUDIO_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": contentType,
    },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`Storage upload -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return path;
}

export async function insertVisitRecording(input: {
  account_id_hint: string | null;
  audio_path: string;
  started_at: string | null;
  ended_at: string | null;
}): Promise<VisitRecording> {
  const [row] = await mutate<VisitRecording>("nb_visit_recordings", "POST", {
    id: randId("vr"),
    status: "uploaded",
    ...input,
  });
  return row;
}

/** Not origin-tagged data (a processing-status row, not a CRM fact), so this bypasses
 * query()'s origin machinery and fetches directly. */
export async function getVisitRecording(id: string): Promise<VisitRecording | null> {
  await verifySession();
  if (!isConfigured()) return null;
  const res = await fetch(`${SB_URL}/rest/v1/nb_visit_recordings?select=*&id=eq.${id}&limit=1`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase nb_visit_recordings -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const rows = (await res.json()) as VisitRecording[];
  return rows[0] ?? null;
}

export async function patchVisitRecording(
  id: string,
  patch: Partial<Pick<VisitRecording, "status" | "transcript" | "touchpoint_id" | "error">>,
): Promise<VisitRecording> {
  const [row] = await mutate<VisitRecording>("nb_visit_recordings", "PATCH", patch, { id: `eq.${id}` });
  return row;
}

// ---------------------------------------------------------------------------
// Import review · the human gate between a CSV and the territory
//
// bridges/nutribiotic/import_data.py writes proposals here and refuses to go
// further; bridges/nutribiotic/promote_import.py applies only what has already
// been decided. This is the screen in between, and without it the decision had
// nowhere to be made and the import path dead-ended.
//
// Import rows carry no `origin` column, and correctly so: a proposal is not yet
// a fact about the territory, it is a claim from a file. So these bypass
// query()'s origin machinery the same way getVisitRecording does.
// ---------------------------------------------------------------------------

export type ImportDecision = "pending" | "merge" | "create" | "reject" | "duplicate";

export type ImportRow = {
  id: number;
  batch_id: string;
  raw: Record<string, string>;
  match_account_id: string | null;
  match_score: number | null;
  match_basis: { hint?: string; why?: string } & Record<string, unknown>;
  decision: ImportDecision;
  decided_at: string | null;
  decided_by: string | null;
  applied_at: string | null;
  applied_account_id: string | null;
  applied_note: string | null;
};

export type ImportBatch = {
  id: string;
  source: string;
  filename: string | null;
  row_count: number | null;
  loaded_at: string;
};

async function raw<T>(path: string): Promise<T[]> {
  await verifyReadAccess();
  if (!isConfigured()) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T[];
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  return raw<ImportBatch>("nb_import_batches?select=*&order=loaded_at.desc&limit=50");
}

/**
 * The review queue. Undecided rows first, because they are the only ones that
 * need a human; within those, the matcher's least confident calls lead, since a
 * decisive phone match needs a glance and an ambiguous one needs thought.
 */
export async function listImportRows(batchId?: string, limit = 400): Promise<ImportRow[]> {
  const scope = batchId ? `&batch_id=eq.${encodeURIComponent(batchId)}` : "";
  return raw<ImportRow>(
    `nb_import_rows?select=*${scope}&order=decision.asc,match_score.asc.nullsfirst&limit=${limit}`,
  );
}

export async function countPendingImports(): Promise<number> {
  const rows = await raw<{ id: number }>(
    "nb_import_rows?select=id&decision=eq.pending&limit=1000",
  );
  return rows.length;
}

/**
 * Record a decision. DOES NOT APPLY IT.
 *
 * The write here is exactly one column plus its audit stamps. Nothing reaches
 * nb_accounts until promote_import.py runs, which keeps the destructive step
 * (a merge that fuses two stores' histories) behind a deliberate command rather
 * than behind a button that could be clicked by accident on a phone in a car.
 */
export async function setImportDecision(
  id: number,
  decision: ImportDecision,
): Promise<void> {
  await mutate<ImportRow>(
    "nb_import_rows",
    "PATCH",
    {
      decision,
      decided_at: decision === "pending" ? null : new Date().toISOString(),
      decided_by: decision === "pending" ? null : "juan",
    },
    { id: `eq.${id}`, applied_at: "is.null" },
  );
}

// ---------------------------------------------------------------------------
// Region search · st_dwithin over nb_accounts.geo (see migration 0014)
// ---------------------------------------------------------------------------

export type NearbyAccount = {
  id: string;
  name: string;
  dba: string | null;
  channel: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  lifecycle: string;
  last_order_at: string | null;
  expected_reorder_at: string | null;
  do_not_visit: boolean;
  quirks: string | null;
  origin: Origin;
  distance_m: number;
  tier: "A" | "B" | "C" | "D" | null;
  fit: number | null;
  engagement: number | null;
};

/**
 * Juan's HubSpot owner id. The territory is defined by this and by nothing else:
 * not a city list, not a spreadsheet tab, not a name pattern. It is the same field
 * HubSpot routes on, so this app and the portal cannot disagree about who is in it.
 */
export const JUAN_OWNER_ID = "36242368";

export type TerritoryArea = {
  id: string;
  label: string;
  color: string;
  display_order: number;
  named_by_human: boolean;
  needs_review: boolean;
  brief: string | null;
  account_count: number;
  /** Optional because listAreas() no longer selects it: the frontier polygons
   *  are fetched on demand by listAreaBoundaries() only when one is about to be
   *  drawn. Undefined means "not loaded", null means "this area has none". */
  boundary?: { type: "MultiPolygon"; coordinates: number[][][][] } | null;
};

/**
 * The territory areas, and the frontiers drawn on the map.
 *
 * REPLACED TWO RADIUS CIRCLES on 2026-08-02. The old picker offered "within 25km of
 * Santa Cruz" and "within 20km of San Francisco", which is the other rep's book, and a
 * radius is the wrong shape for the question anyway: 25km from downtown LA is four
 * different selling days, and 25km from Indio is empty desert. Juan divided the map
 * himself along the lines he drives.
 *
 * THE BOUNDARY IS DERIVED FROM THE ASSIGNMENT, never drawn by hand. assign_areas.py
 * computes it by Voronoi tessellation over the assigned accounts, dissolved per area,
 * so the coloured region on the map is the assignment rule extended to every point in
 * the plane. A pin can never sit inside a colour that is not its own area, and there
 * are no gaps. Two hand-maintained copies of one fact would drift, and the first
 * symptom is a rep driving to a store the map says is in a day he is not working.
 */
/**
 * WITHOUT THE BOUNDARIES (2026-08-26, Juan: the area chips "aren't all that
 * important and they will change as it goes, so if it is a lot to load there's
 * no need to default load them").
 *
 * `select=*` pulled every area's `boundary`, an unsimplified GeoJSON
 * MultiPolygon. assign_areas.py keeps them unsimplified on purpose (per-area
 * simplification opens slivers between neighbours), so that column is by far
 * the heaviest thing on the map's payload, it is serialized into the RSC
 * stream on every load, and the map is force-dynamic so nothing caches it.
 *
 * Everything the chips need (label, colour, count, review flag) is in the
 * columns below and costs almost nothing. The polygons load only if Juan
 * actually turns a frontier on, via listAreaBoundaries.
 */
export async function listAreas(): Promise<TerritoryArea[]> {
  return raw<TerritoryArea>(
    "nb_territory_areas?select=id,label,color,display_order,named_by_human,needs_review,brief,account_count" +
      "&order=display_order.asc",
  );
}

/** The frontier polygons, fetched only when one is about to be drawn. */
export async function listAreaBoundaries(): Promise<Array<Pick<TerritoryArea, "id" | "boundary">>> {
  return raw<Pick<TerritoryArea, "id" | "boundary">>("nb_territory_areas?select=id,boundary");
}

/**
 * Accounts in one area, ranked. Ordered by tier rather than by distance: an area is
 * already a day's drive, so within it the question goes back to "who is worth the
 * call" rather than "what is nearest".
 */
export async function listAccountsInArea(area: string): Promise<Result<TierRow>> {
  return listAccounts({ area });
}

export async function countWithoutCoordinates(): Promise<number> {
  const rows = await raw<{ id: string }>("nb_accounts?select=id&lat=is.null&limit=5000");
  return rows.length;
}

// A-G, matching HQ's own potential scale in HubSpot (potential__cloned_).
// Was A-D while the OS computed its own grade from a 0-100 score; since
// 0021 the letter comes straight from nb_accounts.potential_hq, and a
// narrower type silently dropped every E, F and G account out of the map's
// tier filter while still drawing its pin.
export type Tier = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export type MapAccount = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  /* The route card carries the three ways to reach a stop before you drive to
     it (Juan, 2026-08-05): the portal record, the site, the phone. */
  website: string | null;
  channel: string;
  lifecycle: string;
  do_not_visit: boolean;
  chain_excluded: boolean;
  practice_excluded: boolean;
  hubspot_company_id: string | null;
  tier: Tier | null;
  origin: Origin;
  area: string | null;
  /** Mirror of HubSpot's hs_lead_status, pull-only (0028). Null = unset there. */
  lead_status: string | null;
  /* What the route card needs to answer "what is this account to me" without a
     tap (Juan, 2026-08-05). The three money facts are columns on nb_accounts;
     the category comes from nb_v_account_product_mix (0030). Every one of them
     is nullable and MUST render as absent rather than as zero: an account with
     no loaded orders has not spent nothing, we simply do not know. */
  last_order_at: string | null;
  trailing_12m_revenue: number | null;
  lifetime_revenue: number | null;
  top_category_12m: string | null;
  top_category_lifetime: string | null;
};

/**
 * Every account owned by `ownerName` in HubSpot that ALSO has a Places-verified
 * pin (see geocode.py's corroboration rule). Both conditions are real filters,
 * not display filters: an account with no coordinates is excluded here for the
 * same reason listAccountsInRegion excludes it, and an account owned by someone
 * else never appears on Juan's map no matter how well it is geocoded.
 *
 * The map's "tier" is POTENTIAL (nb_v_account_potential: store type, chain
 * size, lifetime spend), not the fit x engagement tier the accounts list and
 * cadence screens use. Deliberately: fit x engagement collapses every
 * unresearched, unvisited account near zero, which is correct for ROUTE
 * PRIORITY but reads as "everything is a D" on a map whose job is to show
 * which unvisited stores are worth driving to. Potential is measured from
 * facts (store type, locations, spend) that do not require a visit yet.
 *
 * tier is not a column on nb_accounts, so it is fetched separately and joined
 * here rather than embedded in the query() call above, which only ever reads
 * one table.
 */
export async function listOwnerAccounts(ownerName = "Juan Arenas Martin"): Promise<Result<MapAccount>> {
  const [result, grades, mix] = await Promise.all([
    query<Omit<MapAccount, "tier" | "top_category_12m" | "top_category_lifetime">>("nb_accounts", {
      select:
        "id,name,street,city,state,postal,lat,lng,phone,website,channel,lifecycle,do_not_visit,chain_excluded,practice_excluded,hubspot_company_id,origin,area,lead_status,last_order_at,trailing_12m_revenue,lifetime_revenue",
      owner_name: `eq.${ownerName}`,
      lat: "not.is.null",
      /* CLOSED ACCOUNTS ARE NOT PINS. No toggle, unlike chains and practices:
         those hide a business Juan could still walk into, this one is gone.
         Added 2026-08-05 after SILVERLAKE NATURAL FOOD MARKET, deleted from
         HubSpot that morning by delete_closed.py, opened as a normal pin with
         a working GO button. See migration 0026. */
      closed_at: "is.null",
      order: "name.asc",
      limit: 1000,
    }),
    raw<{ account_id: string; potential_grade: Tier }>(
      "nb_v_account_potential?select=account_id,potential_grade&limit=1000",
    ),
    // 0030. Absent row = no loaded order lines, which the card says out loud.
    raw<{ account_id: string; top_category_12m: string | null; top_category_lifetime: string | null }>(
      "nb_v_account_product_mix?select=account_id,top_category_12m,top_category_lifetime&limit=1000",
    ),
  ]);
  const tierById = new Map(grades.map((t) => [t.account_id, t.potential_grade]));
  const mixById = new Map(mix.map((m) => [m.account_id, m]));
  return {
    ...result,
    data: result.data.map((a) => ({
      ...a,
      tier: tierById.get(a.id) ?? null,
      top_category_12m: mixById.get(a.id)?.top_category_12m ?? null,
      top_category_lifetime: mixById.get(a.id)?.top_category_lifetime ?? null,
    })),
  };
}

/**
 * Account ids in Juan's SoCal territory, same scope as listAccounts (owner,
 * not chain/practice-excluded, not closed, not a waypoint) but with no area or
 * row-count limit. Exists because nb_deals and nb_v_pipeline_stale carry no
 * hubspot_owner_id column at all — the portal is shared with another rep, so
 * without this, the pipeline board and weekly review on /clients would surface
 * that rep's deals right alongside Juan's.
 */
export async function listTerritoryAccountIds(): Promise<Set<string>> {
  const rows = await raw<{ id: string }>(
    `nb_accounts?select=id&hubspot_owner_id=eq.${JUAN_OWNER_ID}&chain_excluded=eq.false` +
      `&practice_excluded=eq.false&closed_at=is.null&lifecycle=neq.waypoint&limit=2000`,
  );
  return new Set(rows.map((r) => r.id));
}

/** How many of ownerName's accounts exist locally but have no verified pin yet. */
export async function countOwnerWithoutCoordinates(ownerName = "Juan Arenas Martin"): Promise<number> {
  const rows = await raw<{ id: string }>(
    `nb_accounts?select=id&owner_name=eq.${encodeURIComponent(ownerName)}&lat=is.null&limit=5000`,
  );
  return rows.length;
}

/**
 * Whether the map/ten-closest are currently showing chain_excluded and/or
 * practice_excluded accounts. One row (nb_ui_prefs, id=1, see 0024/0025), so
 * the preference follows Juan across his phone and his desktop rather than
 * resetting per browser the way localStorage would. Both default to false
 * (hidden) if the row is ever missing.
 */
export async function getMapDisplayPrefs(): Promise<{ showChains: boolean; showPractices: boolean }> {
  const rows = await raw<{ show_chain_accounts: boolean; show_practice_accounts: boolean }>(
    "nb_ui_prefs?select=show_chain_accounts,show_practice_accounts&id=eq.1",
  );
  return {
    showChains: rows[0]?.show_chain_accounts ?? false,
    showPractices: rows[0]?.show_practice_accounts ?? false,
  };
}

export async function setShowChainAccounts(show: boolean): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { show_chain_accounts: show, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
}

export async function setShowPracticeAccounts(show: boolean): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { show_practice_accounts: show, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
}

/**
 * The four numbers that turn the ordered route into a day with times on it
 * (migration 0037): when he leaves, how long a door takes, how long lunch is,
 * and when he wants to be home.
 *
 * The SCHEDULE ITSELF IS NOT STORED. Given the order and these inputs, every
 * arrival follows, so keeping the computed times would be a second copy of a
 * fact the list already determines and it would be wrong the moment a stop
 * moved. The panel derives them on render. `returnBy` is a target the screen
 * reports against, not a constraint anything enforces.
 */
/**
 * Where a route starts or ends, when it is not the waypoint account (0040).
 * Resolved once from Google Places when Juan picks it (see
 * lib/stop-actions.ts's searchRouteAddresses) and then frozen, same as a
 * custom stop: a hotel that silently moved mid-plan would be worse than one
 * that is simply wrong until re-picked.
 */
export type RouteEndpoint = { label: string; address: string; lat: number; lng: number };

/**
 * Juan's apartment (migration 0029's waypoint account), as a RouteEndpoint --
 * the same quick-pick "Home" row RouteEndpointField shows on the Map screen,
 * reused on the Reports review screen so correcting a report's start/end
 * offers the same shortcut rather than making him retype the address.
 */
export async function getHomeEndpoint(): Promise<RouteEndpoint | null> {
  const rows = await raw<{ name: string; street: string | null; city: string | null; state: string | null; postal: string | null; lat: number; lng: number }>(
    "nb_accounts?select=name,street,city,state,postal,lat,lng&lifecycle=eq.waypoint&limit=1",
  );
  const w = rows[0];
  if (!w) return null;
  const address = [w.street, w.city, w.state, w.postal].filter(Boolean).join(", ") || w.name;
  return { label: "Home", address, lat: w.lat, lng: w.lng };
}

export type RouteSchedulePrefs = {
  depart: string;          // "09:30", local, no zone: it is a wall clock
  dwellMinutes: number;
  lunchMinutes: number;
  returnBy: string | null;
};

/** Postgres hands back "09:30:00"; the inputs and the display want "09:30". */
function hhmm(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : null;
}

/* A route_start/route_end column is jsonb written by a browser, same trust
   level as route_draft's custom stops: a half-shaped object here would become
   a start/end the panel cannot draw a leg to and the day silently loses its
   first or last drive time. Anything that doesn't fully match the shape is
   dropped back to null (the waypoint default) rather than repaired. */
export function sanitizeRouteEndpoint(x: unknown): RouteEndpoint | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.label !== "string" || typeof o.address !== "string") return null;
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  return { label: o.label, address: o.address, lat: o.lat, lng: o.lng };
}

export async function getRouteSchedulePrefs(): Promise<RouteSchedulePrefs> {
  const rows = await raw<{
    route_depart: string | null;
    route_dwell_minutes: number | null;
    route_lunch_minutes: number | null;
    route_return_by: string | null;
  }>(
    "nb_ui_prefs?select=route_depart,route_dwell_minutes,route_lunch_minutes,route_return_by&id=eq.1",
  );
  const r = rows[0];
  return {
    depart: hhmm(r?.route_depart ?? null) ?? "09:30",
    dwellMinutes: r?.route_dwell_minutes ?? 20,
    lunchMinutes: r?.route_lunch_minutes ?? 60,
    returnBy: hhmm(r?.route_return_by ?? null),
  };
}

export async function setRouteSchedulePrefs(p: RouteSchedulePrefs): Promise<void> {
  await mutate(
    "nb_ui_prefs",
    "PATCH",
    {
      route_depart: p.depart,
      route_dwell_minutes: p.dwellMinutes,
      route_lunch_minutes: p.lunchMinutes,
      route_return_by: p.returnBy,
      updated_at: new Date().toISOString(),
    },
    { id: "eq.1" },
  );
}

/**
 * A stop on the route that is not an account: lunch, the hotel, a warehouse, a
 * parking garage (Juan, 2026-08-05). It carries its own coordinates because it
 * has no row to look them up in, resolved once from Google Places when it is
 * added (see lib/stop-actions.ts) and then frozen. A day is not planned around
 * a lunch place that silently moves.
 */
export type CustomStopKind = "lunch" | "hotel" | "stop";

export type CustomStop = {
  /** Always prefixed "custom:", which is what tells the two apart in a draft. */
  id: string;
  kind: CustomStopKind;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

/** One position in the route: an account id, or a stop that carries itself. */
export type RouteDraftEntry = string | CustomStop;

const CUSTOM_KINDS: CustomStopKind[] = ["lunch", "hotel", "stop"];

/* Anything that is not exactly a stop is dropped, not repaired. This column is
   jsonb written by a browser; a half-shaped object here would become a row in
   the route with no coordinates and no way to remove it. */
function asDraftEntry(x: unknown): RouteDraftEntry | null {
  if (typeof x === "string") return x;
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.startsWith("custom:")) return null;
  if (typeof o.kind !== "string" || !CUSTOM_KINDS.includes(o.kind as CustomStopKind)) return null;
  if (typeof o.label !== "string" || typeof o.address !== "string") return null;
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  return { id: o.id, kind: o.kind as CustomStopKind, label: o.label, address: o.address, lat: o.lat, lng: o.lng };
}

/**
 * The hand-built route under the map: an ordered list where order is stop order
 * (migration 0029). Server-persisted for the same reason the chain/practice
 * toggles are, and one Juan asked for explicitly: a route he assembles on the
 * phone in the morning is still there on the desktop, and still there after a
 * reload, until he removes a stop himself.
 *
 * MIXED ON PURPOSE. A bare string is an account id, which is every entry
 * written before 2026-08-05 and every account added since; an object is a
 * lunch/hotel/other stop that carries its own address and coordinates. One
 * ordered list rather than two, because the ordering IS the route and two
 * lists would have to agree about interleaving on every nudge.
 *
 * Unknown ids are dropped on read rather than rendered as a blank row. That is
 * the tombstone case: an account in the draft that gets closed, or falls out of
 * Juan's book, stops being a stop, and the alternative is a route with a hole
 * in it that cannot be clicked or removed.
 *
 * DAY-PARTITIONED since 2026-08-23 (Juan's ask: plan the whole horizon, not
 * one undated list). `route_draft` is now an object keyed by ISO date rather
 * than a bare array, still one row, still written whole. `getRouteDraftByDay`
 * migrates the old flat-array shape in memory, on read, onto the next
 * Wednesday: the day Juan had already mostly built stays exactly what it was,
 * it just gets a date.
 */
export type RouteDraftByDay = Record<string, RouteDraftEntry[]>;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// planningHorizonDates/nextWeekday/defaultActiveDay live in field-week.ts, not
// here: that file carries no "server-only" tag, so route-context.tsx (a
// client component) can import the date math directly instead of pulling
// this whole server module into the browser bundle. Imported (used below)
// and re-exported, so every existing "./dal" import site (layout.tsx,
// api/widget/route.ts) keeps working unchanged.
import { planningHorizonDates, nextWeekday, defaultActiveDay } from "./field-week";
export { planningHorizonDates, defaultActiveDay };

export async function getRouteDraftByDay(): Promise<RouteDraftByDay> {
  const rows = await raw<{ route_draft: unknown }>("nb_ui_prefs?select=route_draft&id=eq.1");
  return parseRouteDraft(rows[0]?.route_draft);
}

function parseRouteDraft(stored: unknown): RouteDraftByDay {
  if (Array.isArray(stored)) {
    const stops = stored.map(asDraftEntry).filter((e): e is RouteDraftEntry => e !== null);
    return stops.length > 0 ? { [nextWeekday(3)]: stops } : {};
  }

  if (!stored || typeof stored !== "object") return {};
  const out: RouteDraftByDay = {};
  for (const [day, entries] of Object.entries(stored as Record<string, unknown>)) {
    if (!ISO_DATE_RE.test(day) || !Array.isArray(entries)) continue;
    const stops = entries.map(asDraftEntry).filter((e): e is RouteDraftEntry => e !== null);
    if (stops.length > 0) out[day] = stops;
  }
  return out;
}

export async function setRouteDraft(byDay: RouteDraftByDay): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { route_draft: byDay, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
}

/**
 * Route start/end (0040), DAY-PARTITIONED alongside route_draft (2026-08-23):
 * one entry per field day, keyed the same as RouteDraftByDay, present only for
 * a day Juan actually overrode. Split into two columns rather than one, same
 * as before the day-partition, because a day's start and end are independent
 * facts (a run can leave home and end at a hotel, or the reverse) and folding
 * them into one object per day would make "override the end only" a
 * read-modify-write instead of a single key write.
 *
 * THE CHAIN. A day with no start override does not fall straight to home
 * anymore, it falls to the PREVIOUS field day's resolved end (that day's own
 * override, else home) -- see MapScreen's `startFallback`. This is what makes
 * "leave the Hampton Inn Carlsbad" on Tuesday morning automatic once Monday's
 * end was set to it, without Juan re-entering the same hotel twice. Nothing
 * is written for the chase: Tuesday's row stays empty, so if Monday's hotel
 * is later corrected, Tuesday's default corrects with it. A day that WANTS to
 * break the chain (fly out from the hotel, drive straight home the next
 * morning) still overrides its own start explicitly, same as always.
 */
export type RouteEndpointsByDay = Record<string, RouteEndpoint>;

function asRouteEndpointsByDay(stored: unknown): RouteEndpointsByDay {
  if (!stored || typeof stored !== "object") return {};
  const o = stored as Record<string, unknown>;
  // Legacy single-endpoint shape, from before the day-partition: {label,
  // address, lat, lng} sitting at the top level of the column. Migrated onto
  // the next Wednesday in memory, same landing spot getRouteDraftByDay uses
  // for the old flat route_draft array, so a start or end Juan had already
  // picked keeps working rather than silently vanishing.
  if (typeof o.label === "string" && typeof o.address === "string") {
    const ep = sanitizeRouteEndpoint(o);
    return ep ? { [nextWeekday(3)]: ep } : {};
  }
  const out: RouteEndpointsByDay = {};
  for (const [day, v] of Object.entries(o)) {
    if (!ISO_DATE_RE.test(day)) continue;
    const ep = sanitizeRouteEndpoint(v);
    if (ep) out[day] = ep;
  }
  return out;
}

export async function getRouteEndpointsByDay(): Promise<{ start: RouteEndpointsByDay; end: RouteEndpointsByDay }> {
  const rows = await raw<{ route_start: unknown; route_end: unknown }>(
    "nb_ui_prefs?select=route_start,route_end&id=eq.1",
  );
  const r = rows[0];
  return { start: asRouteEndpointsByDay(r?.route_start), end: asRouteEndpointsByDay(r?.route_end) };
}

export async function setRouteStartByDay(byDay: RouteEndpointsByDay): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { route_start: byDay, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
}

export async function setRouteEndByDay(byDay: RouteEndpointsByDay): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { route_end: byDay, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
}

/**
 * A call on the route (migration 0041), day-partitioned like route_draft but
 * a wholly separate list: a call has no drive position, so it never enters
 * route_draft, the drive-leg matrix, or Optimize route's reorder maths. See
 * the migration header for why this is its own column.
 */
export type CallEntry = {
  /** Always prefixed "call:", same convention as a CustomStop's "custom:". */
  id: string;
  /** Who/where, e.g. "Alex Conrad, Vasari Plaster". */
  label: string;
  phone: string;
  /** Optional context: last touchpoint, what's open, why this call. */
  note?: string;
  /** Optional link back to the nb_accounts row this call is about, so the
   *  app can offer a HubSpot link alongside it. Absent for a call to a
   *  number with no account behind it. */
  accountId?: string;
};

export type RouteCallsByDay = Record<string, CallEntry[]>;

/* Anything that is not exactly a call entry is dropped, not repaired, same
   discipline asDraftEntry uses: this column is jsonb written by a browser. */
function asCallEntry(x: unknown): CallEntry | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.startsWith("call:")) return null;
  if (typeof o.label !== "string" || !o.label.trim()) return null;
  if (typeof o.phone !== "string" || !o.phone.trim()) return null;
  const note = typeof o.note === "string" && o.note.trim() ? o.note : undefined;
  const accountId = typeof o.accountId === "string" && o.accountId.trim() ? o.accountId : undefined;
  return {
    id: o.id,
    label: o.label,
    phone: o.phone,
    ...(note ? { note } : {}),
    ...(accountId ? { accountId } : {}),
  };
}

export async function getRouteCallsByDay(): Promise<RouteCallsByDay> {
  const rows = await raw<{ route_calls: unknown }>("nb_ui_prefs?select=route_calls&id=eq.1");
  return parseRouteCalls(rows[0]?.route_calls);
}

function parseRouteCalls(stored: unknown): RouteCallsByDay {
  if (!stored || typeof stored !== "object") return {};
  const out: RouteCallsByDay = {};
  for (const [day, entries] of Object.entries(stored as Record<string, unknown>)) {
    if (!ISO_DATE_RE.test(day) || !Array.isArray(entries)) continue;
    const calls = entries.map(asCallEntry).filter((c): c is CallEntry => c !== null);
    if (calls.length > 0) out[day] = calls;
  }
  return out;
}

export async function setRouteCalls(byDay: RouteCallsByDay): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { route_calls: byDay, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
}

/**
 * Stops marked done on the hand-built route (migration 0042), day-partitioned
 * like route_draft but a bare set of stop ids: a stop marked done stays ON
 * route_draft, this only changes how it renders. See the migration header for
 * why this is not folded into route_draft or route_calls.
 */
export type RouteDoneByDay = Record<string, string[]>;

export async function getRouteDoneByDay(): Promise<RouteDoneByDay> {
  const rows = await raw<{ route_done: unknown }>("nb_ui_prefs?select=route_done&id=eq.1");
  return parseRouteDone(rows[0]?.route_done);
}

function parseRouteDone(stored: unknown): RouteDoneByDay {
  if (!stored || typeof stored !== "object") return {};
  const out: RouteDoneByDay = {};
  for (const [day, entries] of Object.entries(stored as Record<string, unknown>)) {
    if (!ISO_DATE_RE.test(day) || !Array.isArray(entries)) continue;
    const ids = entries.filter((e): e is string => typeof e === "string" && e.length > 0);
    if (ids.length > 0) out[day] = ids;
  }
  return out;
}

export type RouteState = {
  draft: RouteDraftByDay;
  calls: RouteCallsByDay;
  done: RouteDoneByDay;
};

/**
 * All three route jsonb columns in ONE request.
 *
 * They live on the same single `nb_ui_prefs` row (id=1), so reading them
 * separately was three round trips to fetch three cells of one record. That
 * cost sat on the critical path of EVERY NutriBiotic screen, because the
 * layout seeds RouteProvider for all of them, including /visit, which never
 * reads a route. The three single-column getters stay for callers that want
 * exactly one; nothing that loads a page should use them.
 */
export async function getRouteStateByDay(): Promise<RouteState> {
  const rows = await raw<{ route_draft: unknown; route_calls: unknown; route_done: unknown }>(
    "nb_ui_prefs?select=route_draft,route_calls,route_done&id=eq.1",
  );
  const row = rows[0];
  return {
    draft: parseRouteDraft(row?.route_draft),
    calls: parseRouteCalls(row?.route_calls),
    done: parseRouteDone(row?.route_done),
  };
}

export async function setRouteDone(byDay: RouteDoneByDay): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { route_done: byDay, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
}

/**
 * Camera-gated start/end mileage state per route day (migration 0043). See
 * that migration's header for the shape and why this is the one column the
 * widget's read-only NB_WIDGET_TOKEN is allowed to write.
 */
export type RouteMileageSide = {
  /** Digits Claude read off the odometer photo, or the digits Juan typed
   *  himself when he bypassed the camera (see `manual`). Never a guess --
   *  see api/widget/mileage/route.ts's readOdometer. */
  odo: string | null;
  driveFileId: string;
  photoLink: string;
  capturedAt: string;
  /** True when this reading came from the widget's "Enter manually" bypass
   *  rather than a photo -- no odometer photo exists for this side, and the
   *  filed trip row says so in plain text instead of a blank/broken link. */
  manual?: boolean;
};
export type RouteMileageDay = {
  start?: RouteMileageSide;
  end?: RouteMileageSide;
  filedSheetLink?: string;
  fileError?: string;
};
export type RouteMileageByDay = Record<string, RouteMileageDay>;

export async function getRouteMileageByDay(): Promise<RouteMileageByDay> {
  const rows = await raw<{ route_mileage: unknown }>("nb_ui_prefs?select=route_mileage&id=eq.1");
  const stored = rows[0]?.route_mileage;
  if (!stored || typeof stored !== "object") return {};
  const out: RouteMileageByDay = {};
  for (const [day, v] of Object.entries(stored as Record<string, unknown>)) {
    if (ISO_DATE_RE.test(day) && v && typeof v === "object") out[day] = v as RouteMileageDay;
  }
  return out;
}

/**
 * Merge one day's patch into route_mileage and write the whole column back
 * (read-modify-write, same shape as every other day-partitioned column here).
 *
 * GATED HERE, NOT VIA mutate(). mutate() calls verifySession(), which the
 * widget's bearer deliberately cannot pass (see session.ts's split between
 * hasWidgetToken and a real session) -- that boundary is exactly what keeps a
 * copy of NB_WIDGET_TOKEN sitting in a phone script from being able to touch
 * HubSpot, a customer record, or anything else mutate() guards. This is one
 * of a small, deliberate set of exceptions (see also setLastLocationAndAutoComplete
 * below) -- Juan's own odometer photo, nothing customer-facing, nothing that
 * leaves the building. A key set to `undefined`
 * in `patch` is dropped from the day's object (JSON.stringify omits it),
 * which is how a filed day resets back to {} -- waiting for the next start.
 */
export async function setRouteMileageDay(day: string, patch: Partial<RouteMileageDay>): Promise<RouteMileageByDay> {
  if (!(await hasWidgetToken()) && !(await hasAccess())) {
    throw new Error("Unauthorized.");
  }
  if (!isConfigured()) throw new Error("Cannot write mileage: no data source configured.");
  const current = await getRouteMileageByDay();
  const merged = { ...current[day], ...patch };
  const hasAnyKey = Object.values(merged).some((v) => v !== undefined);
  const next = { ...current };
  if (hasAnyKey) next[day] = merged;
  else delete next[day];

  const res = await fetch(`${SB_URL}/rest/v1/nb_ui_prefs?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ route_mileage: next, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`Supabase nb_ui_prefs PATCH -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return next;
}

/**
 * Juan's last known position (migration 0044). ONE ROW, not day-partitioned
 * (see that migration's header): a location is a single point that goes
 * stale the moment he stops moving, not a per-day fact. Callers MUST check
 * `at` themselves -- this getter returns whatever is stored with no
 * freshness opinion of its own, same as every other raw read in this file.
 */
export type LastLocation = { lat: number; lng: number; at: string };

export async function getLastLocation(): Promise<LastLocation | null> {
  const rows = await raw<{ last_location: unknown }>("nb_ui_prefs?select=last_location&id=eq.1");
  const v = rows[0]?.last_location as Partial<LastLocation> | undefined;
  if (!v || typeof v.lat !== "number" || typeof v.lng !== "number" || typeof v.at !== "string") return null;
  return { lat: v.lat, lng: v.lng, at: v.at };
}

function haversineMilesForLocation(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Close enough to call it "there" (Juan, 2026-08-27): a tenth of a mile is
 *  a parking lot, not a neighbourhood -- wide enough to cover where he
 *  actually parks relative to a storefront's own pin, narrow enough that
 *  driving past on a nearby street doesn't fire it. */
const AUTO_DONE_RADIUS_MILES = 0.1;

/**
 * THE ONE WRITE PATH for "where is Juan right now" (migration 0044). Saves
 * the fix, then checks it against today's not-done ACCOUNT stops (never a
 * lunch/hotel/other custom stop -- there's nothing to "visit" there) and
 * marks anything within AUTO_DONE_RADIUS_MILES done, same column and same
 * toggle-able state a manual tap on /nutribiotic/map produces.
 *
 * Called from exactly two places, by design: MapScreen.tsx's existing
 * geolocation request (via reportLiveLocation, prefs-actions.ts) and the
 * widget's "tap to update" button (via api/location/route.ts). Nothing else
 * calls this and nothing polls it -- see the migration header.
 *
 * GATED HERE, NOT VIA mutate() -- same reasoning and same widened bearer as
 * setRouteMileageDay above: Juan's own coordinate, nothing customer-facing.
 *
 * A false-positive auto-done (driving past within a tenth of a mile without
 * actually stopping) costs one tap to undo, the same as any other done mark
 * -- a cheaper mistake than making Juan tap "done" standing at a door he's
 * already at.
 */
export async function setLastLocationAndAutoComplete(lat: number, lng: number): Promise<{ autoDoneIds: string[] }> {
  if (!(await hasWidgetToken()) && !(await hasAccess())) {
    throw new Error("Unauthorized.");
  }
  if (!isConfigured()) throw new Error("Cannot write location: no data source configured.");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("lat/lng must be finite numbers.");
  }

  const [routeState, accounts] = await Promise.all([getRouteStateByDay(), listOwnerAccounts()]);
  const days = planningHorizonDates();
  const day = defaultActiveDay(routeState.draft, days);
  const draft = routeState.draft[day] ?? [];
  const doneIds = new Set(routeState.done[day] ?? []);
  const byId = new Map(accounts.data.map((a) => [a.id, a]));

  const newlyDone: string[] = [];
  for (const entry of draft) {
    if (typeof entry !== "string") continue; // account stops only
    if (doneIds.has(entry)) continue;
    const a = byId.get(entry);
    if (!a) continue;
    if (haversineMilesForLocation({ lat, lng }, { lat: a.lat, lng: a.lng }) < AUTO_DONE_RADIUS_MILES) {
      newlyDone.push(entry);
    }
  }

  const at = new Date().toISOString();
  const body: Record<string, unknown> = { last_location: { lat, lng, at }, updated_at: at };
  if (newlyDone.length > 0) {
    body.route_done = { ...routeState.done, [day]: [...doneIds, ...newlyDone] };
  }

  const res = await fetch(`${SB_URL}/rest/v1/nb_ui_prefs?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Supabase nb_ui_prefs PATCH -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return { autoDoneIds: newlyDone };
}

/**
 * Juan's most recently recorded odometer digits (migration 0047). ONE ROW,
 * not day-partitioned, same reasoning as last_location above: the odometer
 * is a single running total, not a per-day fact. Written from every side
 * api/widget/mileage records with a real number, photo or bypass, regardless
 * of which day or which side it belonged to -- whatever came in last IS the
 * current reading. Feeds the bypass's own auto-carry: a bypassed START uses
 * this value instead of asking Juan to type or re-photograph a number the
 * car hasn't actually changed (his ask 2026-08-27 -- he doesn't drive this
 * car personally between trips, so last END really is next START).
 */
export type LastRouteOdo = { value: string; at: string };

export async function getLastRouteOdo(): Promise<LastRouteOdo | null> {
  const rows = await raw<{ last_route_odo: unknown }>("nb_ui_prefs?select=last_route_odo&id=eq.1");
  const v = rows[0]?.last_route_odo as Partial<LastRouteOdo> | undefined;
  if (!v || typeof v.value !== "string" || typeof v.at !== "string") return null;
  return { value: v.value, at: v.at };
}

/** GATED HERE, NOT VIA mutate() -- same widened bearer as setRouteMileageDay
 *  above: Juan's own odometer digits, nothing customer-facing. */
export async function setLastRouteOdo(value: string): Promise<void> {
  if (!(await hasWidgetToken()) && !(await hasAccess())) {
    throw new Error("Unauthorized.");
  }
  if (!isConfigured()) throw new Error("Cannot write odometer: no data source configured.");
  const res = await fetch(`${SB_URL}/rest/v1/nb_ui_prefs?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ last_route_odo: { value, at: new Date().toISOString() }, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`Supabase nb_ui_prefs PATCH -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// Route plans (phase 5 · nb_route_plans / nb_route_days / nb_route_stops)
//
// WHY THIS IS A LIVE READ AND NOT A GENERATED data.ts.
//
// The month plan below it on the Plan screen was hand-transcribed into a
// TypeScript array and committed. That array carries named businesses, street
// addresses and phone numbers belonging to NutriBiotic's customers, and this
// repository is PUBLIC. nutribiotic/AGENTS.md HARD RULE 9 says customer lists
// and phone numbers are never committed to git; the standing month array
// predates that being noticed and is flagged, but nothing new is added to it.
//
// So the dated week is served from the employer's own database at request time.
// Same data on screen, none of it in a commit, and as a bonus the screen can no
// longer disagree with nb_route_stops, which is the actual source of truth.
// ---------------------------------------------------------------------------

/** A non-account point Juan pinned by hand (nb_route_stops.account_id is NOT NULL,
 *  and minting an account row for a fixed waypoint would auto-create a record a
 *  human never approved). They live in nb_route_days.directions_cache. */
export type PinnedWaypoint = {
  name: string;
  street: string;
  city: string;
  postal: string;
  phone: string;
  lat: number;
  lng: number;
  locked_time: string;
  hours: string;
  note: string;
};

export type RouteStopRow = {
  seq: number;
  priority_band: number;
  eta: string;
  etd: string;
  drive_seconds: number | null;
  drive_meters: number | null;
  dwell_minutes: number;
  window_open: string | null;
  window_close: string | null;
  nb_accounts: {
    id: string;
    name: string;
    street: string | null;
    city: string | null;
    phone: string | null;
    website: string | null;
    last_order_at: string | null;
    lifetime_revenue: number | null;
    places_status: string | null;
    lat: number | null;
    lng: number | null;
    hubspot_company_id: string | null;
  } | null;
};

export type RouteDayRow = {
  id: string;
  date: string;
  kind: string;
  cluster_id: string | null;
  depart_at: string | null;
  return_by: string | null;
  start_lat: number | null;
  start_lng: number | null;
  directions_cache: { pinned_waypoints?: PinnedWaypoint[] } | null;
  nb_route_stops: RouteStopRow[];
};

/**
 * The per-stop field brief, snapshotted into nb_route_plans.config at plan time.
 *
 * `contacts` is the ONE field on here that is re-read live rather than trusted
 * from the snapshot: see getCurrentRoutePlan below. Everything else (the opener,
 * the corrected pin, the corridor multiplier) describes a decision made when the
 * week was planned and would be wrong to silently restate.
 */
export type StopBrief = {
  maps_address: string;
  /** LIVE from nb_contacts at request time, not the plan-time snapshot. */
  contacts: string[];
  opener: string;
  hours: string | null;
  hours_note: string;
  pin_source: string;
  corridors: string[];
  traffic_multiplier: number;
  tier: string | null;
  lifecycle: string | null;
};

export type RoutePlan = {
  id: string;
  week_start: string;
  status: string;
  config: {
    dwell_minutes?: number;
    stops_per_day_max?: number;
    drive_times?: string;
    home_base?: { address?: string };
    sequencing?: string;
    not_routed?: { name: string; was: string; why: string }[];
    data_flags?: { name: string; day: string; flag: string }[];
    field_brief?: Record<string, StopBrief>;
    day_notes?: Record<string, { label: string; note: string;
      return_drive_minutes: number; return_drive_miles: number }>;
  } | null;
  days: RouteDayRow[];
};

/**
 * The most recent route plan whose week has not finished. Returns null rather
 * than an empty shell when nothing is planned, so the screen can say so plainly
 * instead of rendering a convincing blank week.
 */
export async function getCurrentRoutePlan(): Promise<RoutePlan | null> {
  if (!isConfigured()) return null;

  const plans = await raw<{ id: string; week_start: string; status: string; config: RoutePlan["config"] }>(
    "nb_route_plans?select=id,week_start,status,config&order=week_start.desc&limit=1",
  );
  if (plans.length === 0) return null;

  const days = await raw<RouteDayRow>(
    `nb_route_days?plan_id=eq.${plans[0].id}&order=date.asc` +
      "&select=id,date,kind,cluster_id,depart_at,return_by,start_lat,start_lng,directions_cache," +
      "nb_route_stops(seq,priority_band,eta,etd,drive_seconds,drive_meters,dwell_minutes," +
      "window_open,window_close," +
      "nb_accounts(id,name,street,city,phone,website,last_order_at,lifetime_revenue,places_status,lat,lng,hubspot_company_id))",
  );

  // PostgREST does not order an embedded resource for us. An out-of-order day is
  // the one bug that would be invisible on screen and wrong in the field.
  for (const d of days) d.nb_route_stops.sort((a, b) => a.seq - b.seq);

  const plan = { ...plans[0], days };

  /* WHO YOU ARE SELLING TO IS READ LIVE, not taken from the snapshot.
   *
   * config.field_brief is written once by plan_week.py when the week is built.
   * That is right for the openers and the pin corrections, which record a
   * decision. It is wrong for contacts: a name found on Monday would sit
   * invisible behind a Sunday snapshot for the rest of the week, and the screen
   * would show "no contact" over a database row that says otherwise. The week
   * plan is the one screen read while standing outside the store, so it gets the
   * current answer, not the one that was current on Sunday.
   *
   * Audited 2026-08-02 before the "No contact on file" placeholder was removed:
   * all 49 stops on wk_2026_32 matched live nb_contacts exactly, 31 of them
   * genuinely contact-less. The snapshot was accurate; it just had no guarantee
   * of staying that way. Formatting matches plan_week.py so the CSV/markdown
   * exports and this screen read identically.
   */
  const stopIds = [
    ...new Set(days.flatMap((d) => d.nb_route_stops.map((s) => s.nb_accounts?.id).filter(Boolean))),
  ] as string[];

  if (plan.config?.field_brief && stopIds.length > 0) {
    const live = await raw<{
      account_id: string;
      first_name: string | null;
      last_name: string | null;
      title: string | null;
    }>(
      `nb_contacts?account_id=in.(${stopIds.join(",")})` +
        "&select=account_id,first_name,last_name,title,is_decision_maker" +
        "&order=is_decision_maker.desc,last_name.asc",
    );

    const byAccount = new Map<string, string[]>();
    for (const c of live) {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      // A row with neither name is not a person we can ask for; it is not a
      // finding either. Dropped rather than rendered as a bare title.
      if (!name) continue;
      const label = c.title ? `${name} · ${c.title}` : name;
      byAccount.set(c.account_id, [...(byAccount.get(c.account_id) ?? []), label]);
    }

    for (const id of stopIds) {
      const brief = plan.config.field_brief[id];
      if (brief) brief.contacts = byAccount.get(id) ?? [];
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Promo (phone / offer_builder). GATED side of the offer system: everything
// here runs behind verifySession() like the rest of this file. The buyer-facing
// reads live in promo-public.ts, the one documented exception to this door;
// see the header there for why it exists and what bounds it.
// ---------------------------------------------------------------------------

import {
  codeSuffix,
  freezeSnapshot,
  normalizeCode,
  OFFER_TTL_DAYS,
  type PromoCode,
  type PromoOrder,
  type PromoProduct,
  type PromoTemplate,
  type TemplateBlocks,
} from "./promo";

export async function listPromoProducts(): Promise<PromoProduct[]> {
  const r = await query<PromoProduct & { origin?: Origin }>("nb_promo_products", {
    select: "*",
    order: "name.asc",
  });
  return r.data;
}

export async function upsertPromoProduct(
  p: Omit<PromoProduct, "id"> & { id?: string },
): Promise<PromoProduct> {
  if (p.id) {
    const rows = await mutate<PromoProduct>("nb_promo_products", "PATCH", p, { id: `eq.${p.id}` });
    return rows[0];
  }
  const rows = await mutate<PromoProduct>("nb_promo_products", "POST", { ...p, id: randId("pprod") });
  return rows[0];
}

export async function listPromoTemplates(): Promise<PromoTemplate[]> {
  const r = await query<PromoTemplate & { origin?: Origin }>("nb_promo_templates", {
    select: "*",
    order: "updated_at.desc",
  });
  return r.data;
}

export async function upsertPromoTemplate(
  t: {
    id?: string;
    name: string;
    client_type: string;
    headline: string | null;
    subhead: string | null;
    body_blocks: TemplateBlocks;
    show_margin: boolean;
    bonus_label: string | null;
    is_general: boolean;
    active: boolean;
  },
): Promise<PromoTemplate> {
  if (t.id) {
    /* Editing a published template versions rather than rewrites: pages a
       buyer already saw are frozen in their code's snapshot regardless, but
       the bumped version number keeps "which offer did they get" answerable. */
    const { id, ...rest } = t;
    const cur = await query<PromoTemplate & { origin?: Origin }>("nb_promo_templates", {
      select: "version",
      id: `eq.${id}`,
    });
    const rows = await mutate<PromoTemplate>(
      "nb_promo_templates",
      "PATCH",
      { ...rest, version: (cur.data[0]?.version ?? 0) + 1, updated_at: new Date().toISOString() },
      { id: `eq.${id}` },
    );
    return rows[0];
  }
  const rows = await mutate<PromoTemplate>("nb_promo_templates", "POST", { ...t, id: randId("ptpl") });
  return rows[0];
}

export async function listPromoCodes(limit = 200): Promise<PromoCode[]> {
  const r = await query<PromoCode & { origin?: Origin }>("nb_promo_codes", {
    select: "*",
    order: "created_at.desc",
    limit,
  });
  return r.data;
}

/**
 * Issue a code: freeze the template into a snapshot, mint JA-XXX-NN-SS, insert.
 * The sequence number is per client-type and purely cosmetic (the suffix is
 * what defeats guessing), so a count query is enough; a collision on the full
 * normalized code retries with a fresh suffix.
 */
export async function createPromoCode(opts: {
  template_id: string;
  client_name: string | null;
  client_company?: string | null;
  urgency: "none" | "72h" | "7d";
  rep_notes?: string | null;
}): Promise<PromoCode> {
  const tpls = await query<PromoTemplate & { origin?: Origin }>("nb_promo_templates", {
    select: "*",
    id: `eq.${opts.template_id}`,
  });
  const tpl = tpls.data[0];
  if (!tpl) throw new Error("Template not found.");
  if (!tpl.active) throw new Error(`"${tpl.name}" is not published; publish it in the builder first.`);

  const products = await listPromoProducts();
  const snapshot = freezeSnapshot(tpl, products);

  /* Code shape simplified 2026-08-10 at Juan's direction: JA-NN-SS, one global
     sequence, no client-type stem. Four characters after JA is what a hand
     writes on a card in a parking lot; the offer's type lives in the OS list,
     not in the code. The random suffix still carries the anti-guessing weight. */
  const existing = await query<{ code_norm: string; origin?: Origin }>("nb_promo_codes", {
    select: "code_norm",
  });
  const seq = String(existing.data.length + 1).padStart(2, "0");

  const now = Date.now();
  const bonusMs = opts.urgency === "72h" ? 72 * 3600_000 : opts.urgency === "7d" ? 7 * 86400_000 : null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const display = `JA-${seq}-${codeSuffix()}`;
    const row: Omit<PromoCode, "first_viewed_at" | "requested_at" | "created_at"> = {
      code_norm: normalizeCode(display),
      display_code: display,
      template_id: tpl.id,
      client_name: opts.client_name,
      client_company: opts.client_company ?? null,
      snapshot,
      show_margin: tpl.show_margin,
      bonus_label: bonusMs ? tpl.bonus_label : null,
      bonus_expires_at: bonusMs ? new Date(now + bonusMs).toISOString() : null,
      expires_at: new Date(now + OFFER_TTL_DAYS * 86400_000).toISOString(),
      state: "issued",
      rep_notes: opts.rep_notes ?? null,
    };
    try {
      const rows = await mutate<PromoCode>("nb_promo_codes", "POST", row);
      return rows[0];
    } catch (e) {
      // Unique violation on the suffix lottery: try again. Anything else is real.
      if (attempt === 3 || !String(e).includes("409")) throw e;
    }
  }
  throw new Error("Could not mint a unique code.");
}

export async function voidPromoCode(code_norm: string): Promise<void> {
  await mutate("nb_promo_codes", "PATCH", { state: "void" }, { code_norm: `eq.${code_norm}` });
}

export async function savePromoCodeNotes(code_norm: string, rep_notes: string): Promise<void> {
  await mutate("nb_promo_codes", "PATCH", { rep_notes }, { code_norm: `eq.${code_norm}` });
}

export async function listPromoOrders(limit = 100): Promise<PromoOrder[]> {
  const r = await query<PromoOrder & { origin?: Origin }>("nb_promo_orders", {
    select: "*",
    order: "created_at.desc",
    limit,
  });
  return r.data;
}

/** new -> reviewed -> relayed -> closed; relayed stamps the relay time. */
export async function setPromoOrderState(id: string, state: PromoOrder["state"]): Promise<void> {
  const patch: Record<string, unknown> = { state };
  if (state === "relayed") patch.relayed_at = new Date().toISOString();
  await mutate("nb_promo_orders", "PATCH", patch, { id: `eq.${id}` });
}

// ---------------------------------------------------------------------------
// HubSpot boundary support
//
// Two functions the app needs now that it writes to HubSpot itself rather than
// leaving that entirely to the Mac. Both live here because this file is the
// only door to Supabase, and neither should tempt a caller into opening a
// second one.
// ---------------------------------------------------------------------------

/**
 * Read a mirrored config file out of nb_config.
 *
 * The authoritative copy is the JSON file in the agency repo named by the row's
 * `source`; this is a derived mirror published by bridges/nutribiotic/
 * publish_config.py, because `portfolio` is a separate submodule and cannot see
 * that repo at build or run time. See migration 0033.
 *
 * Returns null rather than throwing when the mirror is absent, so callers can
 * fail closed. A missing config must mean "write nothing", never "write
 * everything the token allows".
 */
export const readConfig = cache(async <T>(key: string): Promise<T | null> => {
  await verifySession();
  if (!isConfigured()) return null;

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/nb_config?select=value&key=eq.${encodeURIComponent(key)}&limit=1`,
      {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ value: T }>;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
});

export type HubspotLogRow = {
  direction: "push" | "pull";
  entity: string;
  operation: string;
  payload_hash: string;
  status: "ok" | "skipped_idempotent" | "conflict" | "error" | "rate_limited" | "network_error";
  http_status?: number;
  local_id?: string;
  hubspot_id?: string;
  request?: unknown;
  response?: unknown;
  error?: string;
};

/**
 * A compact stand-in for a body too bulky to keep whole. Mirrors
 * `receipt()` in bridges/nutribiotic/hubspot.py.
 */
function receipt(obj: unknown): Record<string, unknown> {
  let bytes = 0;
  try {
    bytes = JSON.stringify(obj)?.length ?? 0;
  } catch {
    return { _trimmed: true, note: "unserializable body" };
  }
  const out: Record<string, unknown> = { _trimmed: true, bytes };
  if (Array.isArray(obj)) out.results = obj.length;
  else if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (Array.isArray(o.results)) out.results = o.results.length;
    out.keys = Object.keys(o).sort().slice(0, 12);
  }
  return out;
}

/**
 * Append one row to nb_hubspot_sync_log. NEVER THROWS.
 *
 * The contract is copied deliberately from hubspot.py:101-119: a logging
 * failure must not take down a call that otherwise succeeded. It is also why
 * this does not go through mutate(), which throws on a bad response and would
 * turn an unwritable log into a failed HubSpot write.
 *
 * The log is not telemetry. A field-ownership bug surfaces as a value quietly
 * reverting weeks later, and 90 days of full request/response is the only thing
 * that makes such a clobber reconstructible. It is what made the 2026-08-01
 * cross-book push revertible.
 */
export async function logHubspotCall(row: HubspotLogRow): Promise<void> {
  try {
    if (!isConfigured()) return;
    await fetch(`${SB_URL}/rest/v1/nb_hubspot_sync_log`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([
        {
          ...row,
          // Pull bodies are receipts, not full copies. A clobber worth
          // reconstructing is a WRITE, so pushes keep everything; reads keep a
          // size and count. Without this the 60-second reads alone put 615 MB
          // into a 650 MB database in twelve days. See hubspot.py's log().
          request:
            row.request === undefined
              ? undefined
              : row.direction === "pull"
                ? receipt(row.request)
                : row.request,
          response:
            row.response === undefined
              ? undefined
              : row.direction === "pull"
                ? receipt(row.response)
                : row.response,
          error: row.error ? row.error.slice(0, 2000) : undefined,
        },
      ]),
    });
  } catch {
    // Swallowed on purpose. See the contract above.
  }
}

// ---------------------------------------------------------------------------
// Reports (its own tab under More since 2026-08-23, split out of Playbook).
// The latest daily and weekly field-report PDFs, one click away, plus an
// archive of every prior one.
// bridges/nutribiotic/field_report.py and weekly_report.py upload each run's
// PDF to this bucket under a date-stamped name and never delete an older one
// (see sb.storage_publish_archived; Juan's ask 2026-08-23, this used to
// prune to one file per kind). The bucket is flat and its filenames sort
// correctly as dates (daily-2026-08-20.pdf, weekly-2026-08-17_to_2026-08-20.pdf),
// so "latest" is just the top of a name-descending sort, no date parsing
// needed. Private bucket, signed URL per render, same posture as the
// session gate on the rest of the OS rather than a public link that
// outlives this page view.
// ---------------------------------------------------------------------------

const REPORTS_BUCKET = "nb-reports";

export type PlaybookReport = {
  kind: "daily" | "weekly";
  label: string;
  url: string;
};

function reportLabel(kind: "daily" | "weekly", name: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  const stem = name.replace(/^(daily|weekly)-/, "").replace(/\.pdf$/, "");
  if (kind === "daily") return fmt(stem);
  const [start, end] = stem.split("_to_");
  if (!start || !end) return stem;
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Every object in the reports bucket, newest-first within each kind. Name-
 *  descending sort is enough, the date-stamped filenames already sort as
 *  dates (ISO year-month-day). Not exported: both functions below build on
 *  this one list call rather than each hitting Storage separately. */
async function listReportObjectsByKind(): Promise<Record<"daily" | "weekly", string[]>> {
  const listRes = await fetch(`${SB_URL}/storage/v1/object/list/${REPORTS_BUCKET}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: "", limit: 100, sortBy: { column: "name", order: "desc" } }),
    cache: "no-store",
  });
  if (!listRes.ok) return { daily: [], weekly: [] };
  const objects = (await listRes.json()) as Array<{ name: string }>;
  return {
    daily: objects.filter((o) => o.name.startsWith("daily-")).map((o) => o.name),
    weekly: objects.filter((o) => o.name.startsWith("weekly-")).map((o) => o.name),
  };
}

async function signReportNames(names: string[]): Promise<PlaybookReport[]> {
  const signed = await Promise.all(
    names.map(async (name) => {
      const kind = name.startsWith("daily-") ? ("daily" as const) : ("weekly" as const);
      const signRes = await fetch(
        `${SB_URL}/storage/v1/object/sign/${REPORTS_BUCKET}/${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expiresIn: 300 }),
          cache: "no-store",
        },
      );
      if (!signRes.ok) return null;
      const { signedURL } = (await signRes.json()) as { signedURL: string };
      return { kind, label: reportLabel(kind, name), url: `${SB_URL}/storage/v1${signedURL}` };
    }),
  );
  return signed.filter((r): r is PlaybookReport => r !== null);
}

/** Latest report of each kind. Never throws: an unreachable or empty bucket
 *  just means the Reports section shows nothing rather than the whole
 *  Playbook page failing to render. */
export async function listPlaybookReports(): Promise<PlaybookReport[]> {
  await verifySession();
  if (!isConfigured()) return [];
  try {
    const byKind = await listReportObjectsByKind();
    const latestNames = (["daily", "weekly"] as const)
      .map((kind) => byKind[kind][0])
      .filter((n): n is string => Boolean(n));
    return await signReportNames(latestNames);
  } catch {
    return [];
  }
}

/** Every report older than the latest of its kind, newest-first, capped so a
 *  year of dailies doesn't turn one page load into dozens of sequential
 *  signs. The cap is stated in the return so the page can say what it's not
 *  showing rather than truncating silently. */
const ARCHIVE_CAP_PER_KIND = 20;

export type PlaybookReportArchive = {
  reports: PlaybookReport[];
  truncated: Partial<Record<"daily" | "weekly", number>>; // count hidden past the cap, per kind
};

export async function listPlaybookReportArchive(): Promise<PlaybookReportArchive> {
  await verifySession();
  if (!isConfigured()) return { reports: [], truncated: {} };
  try {
    const byKind = await listReportObjectsByKind();
    const truncated: PlaybookReportArchive["truncated"] = {};
    const names: string[] = [];
    for (const kind of ["daily", "weekly"] as const) {
      const older = byKind[kind].slice(1); // drop the latest, that's the card above
      names.push(...older.slice(0, ARCHIVE_CAP_PER_KIND));
      if (older.length > ARCHIVE_CAP_PER_KIND) truncated[kind] = older.length - ARCHIVE_CAP_PER_KIND;
    }
    const reports = await signReportNames(names);
    return { reports, truncated };
  } catch {
    return { reports: [], truncated: {} };
  }
}

/* ---------------------------------------------------------------------- *
 * Outreach: marketing/field-material attachments + phone lookups.
 *
 * MARKETING_BUCKET mirrors REPORTS_BUCKET's pattern exactly (list -> sign
 * each object, 300s expiry), the one difference being this bucket keeps
 * TWO real folders (marketing/, field/) rather than a flat, one-per-kind
 * shelf, so the Storage list API's own delimiter semantics are used
 * directly instead of the client-side prefix filter storage_publish_latest
 * needs for a flat bucket. Source of truth is Juan's own Desktop, synced in
 * by bridges/nutribiotic/sync_marketing_files.py; this DAL function only
 * ever reads what that script has already uploaded.
 * ---------------------------------------------------------------------- */

const MARKETING_BUCKET = "nb-marketing";

export type MarketingFile = {
  folder: "marketing" | "field";
  name: string;
  label: string;
  url: string;
};

async function listMarketingFolder(folder: "marketing" | "field"): Promise<MarketingFile[]> {
  const listRes = await fetch(`${SB_URL}/storage/v1/object/list/${MARKETING_BUCKET}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `${folder}/`, limit: 200, sortBy: { column: "name", order: "asc" } }),
    cache: "no-store",
  });
  if (!listRes.ok) return [];
  const objects = (await listRes.json()) as Array<{ name: string }>;

  const files: MarketingFile[] = [];
  for (const obj of objects) {
    const signRes = await fetch(
      // `folder` is a fixed, ASCII-safe path segment; only the filename gets
      // encoded. Encoding the two together (encodeURIComponent on the whole
      // "folder/name" string) turns the internal "/" into "%2F", which gets
      // baked into the signed token's own url claim but decoded back to "/"
      // by the time the redemption request lands, so it can never verify
      // (confirmed live 2026-08-13: every download 400'd InvalidSignature).
      `${SB_URL}/storage/v1/object/sign/${MARKETING_BUCKET}/${folder}/${encodeURIComponent(obj.name)}`,
      {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 300 }),
        cache: "no-store",
      },
    );
    if (!signRes.ok) continue;
    const { signedURL } = (await signRes.json()) as { signedURL: string };
    // `&download=<name>` is what makes the response carry Content-Disposition:
    // attachment (confirmed live 2026-08-13: absent this, the cross-origin
    // Supabase URL serves inline and a PDF just opens a new tab instead of
    // downloading, which is silent and easy to miss). Belongs on the final
    // URL, not the sign request body -- the sign endpoint ignores it there.
    //
    // The `.replace(/ /g, "%20")` is load-bearing, not cosmetic: Supabase's
    // own signedURL response can carry a literal, unencoded space for a
    // filename like "Clarity+ Flyer.pdf" (confirmed live 2026-08-13) even
    // though the path segment was sent already percent-encoded. Browsers
    // tolerate a raw space in a URL by auto-encoding it on navigation, but
    // relying on that silently is exactly the class of bug the %2F signature
    // mismatch above already was, so it's fixed explicitly here instead. A
    // plain `encodeURI()` would be wrong: it re-escapes the existing %XX
    // sequences (including the token) into %25XX and breaks the signature.
    files.push({
      folder,
      name: obj.name,
      label: obj.name,
      url: `${SB_URL}/storage/v1${signedURL}&download=${encodeURIComponent(obj.name)}`.replace(/ /g, "%20"),
    });
  }
  return files;
}

/** Never throws: an unreachable or empty bucket just means the attachment
 *  picker shows nothing, same degrade-honestly rule as listPlaybookReports. */
export async function listMarketingFiles(): Promise<MarketingFile[]> {
  await verifySession();
  if (!isConfigured()) return [];
  try {
    const [marketing, field] = await Promise.all([
      listMarketingFolder("marketing"),
      listMarketingFolder("field"),
    ]);
    return [...marketing, ...field];
  } catch {
    return [];
  }
}

export type OutreachContact = {
  id: string;
  account_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  phone: string;
};

/** Every named contact with a phone on file, across Juan's whole book, for the
 *  Outreach recipient picker. One query rather than one per account: the
 *  picker needs all of them up front to search across accounts. */
export async function listOwnerContactPhones(ownerName = "Juan Arenas Martin"): Promise<OutreachContact[]> {
  await verifySession();
  if (!isConfigured()) return [];
  const accounts = await raw<{ id: string }>(
    `nb_accounts?select=id&owner_name=eq.${encodeURIComponent(ownerName)}&closed_at=is.null`,
  );
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.id).join(",");
  return raw<OutreachContact>(
    `nb_contacts?select=id,account_id,first_name,last_name,title,phone&account_id=in.(${ids})&phone=not.is.null`,
  );
}

// ---------------------------------------------------------------------------
// The report review gate (migrations 0045/0046)
//
// The app RECORDS decisions here; bridges/nutribiotic/field_report.py --serve
// does every render and the send, because Vercel can run neither Playwright
// nor /usr/bin/python3. Same split as nb_import_rows and nb_calendar_proposals.
// ---------------------------------------------------------------------------

/** One HQ note on the report. Free text: model-drafted, human-editable, with
 *  no upstream record for it to contradict. */
export type ReportHqNote = { category: string; text: string; source: string };

/** Only the slice of build_report()'s dict the review screen reads or writes.
 *  The payload carries far more; everything not named here is passed through
 *  untouched, because it belongs to HubSpot and is corrected there. */
export type ReportPayload = {
  date_label?: string;
  date_iso?: string;
  no_return?: boolean;
  /** field_report.py's computed figure (build_report) or last recompute
   *  (apply_edits). Read-only from here -- write miles_override instead. */
  miles?: number | null;
  /** A figure Juan typed by hand. Null means "recompute from start/stops/end",
   *  which is what apply_edits does on every render once this is cleared. */
  miles_override?: number | null;
  /** field_report.py's resolved default for the day (route_endpoints_for):
   *  the route plan's start/end, or home if nothing was planned. Read-only --
   *  write route_start_override/route_end_override to correct it. */
  route_start?: RouteEndpoint;
  route_end?: RouteEndpoint;
  /** Juan's correction, when the resolved default above is wrong -- the
   *  2026-08-27 bug (a Sands of La Jolla overnight reported as a round trip
   *  from Manhattan Beach). Null means "use route_start/route_end as-is". */
  route_start_override?: RouteEndpoint | null;
  route_end_override?: RouteEndpoint | null;
  hq_notes?: ReportHqNote[];
  summary?: Record<string, number | boolean | null>;
  stops?: Array<{
    n?: number;
    name?: string;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
    is_call_only?: boolean;
    is_message_only?: boolean;
    hidden?: boolean;
    events?: unknown[];
  }>;
  /** Companies with an open HubSpot Task and no visit this window --
   *  field_report.py's assemble_stops() pulls these out rather than fake a
   *  driven leg for a task that's merely due, not happened. Read-only here:
   *  the task itself is corrected in HubSpot, not on this screen. */
  follow_ups?: Array<{
    hubspot_id?: string;
    name?: string;
    city?: string | null;
    due?: string | null;
    body?: string | null;
  }>;
  [k: string]: unknown;
};

export type ReportDraft = {
  report_date: string;
  kind: "daily" | "weekly";
  payload: ReportPayload | null;
  status: "pending" | "approved" | "sent" | "held";
  dirty: boolean;
  rebuild_requested: boolean;
  /** True once Juan has saved an edit through this screen (migration 0049).
   *  False on a row nobody has opened -- that's what tells run_deadline() a
   *  pre-deadline refresh from HubSpot is safe, nothing of his to lose. */
  edited: boolean;
  preview_path: string | null;
  sent_at: string | null;
  send_error: string | null;
  updated_at: string;
};

/** All-time dashboard, /nutribiotic/reports (migration 0048). One row per
 *  metric, SUM(value) already done by nb_v_report_metrics_alltime -- this is
 *  the whole query. field_report.py's build_report() writes the underlying
 *  rows every time it builds a day, so this is never a separate rollup to
 *  keep in sync by hand. */
export type AllTimeMetrics = {
  visits: number;
  touchpoints: number;
  miles: number;
  daysWorked: number;
  newAccounts: number;
  accountsClosed: number;
  throughDate: string | null;
};

export async function getAllTimeMetrics(): Promise<AllTimeMetrics | null> {
  await verifySession();
  if (!isConfigured()) return null;
  try {
    const rows = await raw<{ metric: string; total: number; through_date: string | null }>(
      "nb_v_report_metrics_alltime?select=metric,total,through_date",
    );
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, Number(r.total)]));
    const throughDate = rows.reduce<string | null>(
      (max, r) => (r.through_date && (!max || r.through_date > max) ? r.through_date : max),
      null,
    );
    return {
      visits: byMetric.visits ?? 0,
      touchpoints: byMetric.touchpoints ?? 0,
      miles: byMetric.miles ?? 0,
      daysWorked: byMetric.day_worked ?? 0,
      newAccounts: byMetric.new_accounts ?? 0,
      accountsClosed: byMetric.accounts_closed ?? 0,
      throughDate,
    };
  } catch {
    return null;
  }
}

/** Today in Los Angeles, which is the day the report is about. Never the
 *  server's date: Vercel runs UTC, and after 17:00 LA those disagree. */
export function reportDateLA(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The Mon-Thu week a date falls in, keyed by its Thursday (end_date) --
 *  matches weekly_report.py's own build_week_draft() key and
 *  field_report.py's build_draft()-side cascade (2026-08-28: "weekly is
 *  derived from daily so should auto update"). Plain calendar math on a
 *  YYYY-MM-DD string, no timezone in play. Null for a Fri/Sat/Sun date --
 *  Juan doesn't work the field then, so no Mon-Thu week contains it. */
export function weekWindowFor(dateISO: string): { start: string; end: string } | null {
  const d = new Date(`${dateISO}T00:00:00`);
  const jsDay = d.getDay(); // Sun=0 .. Sat=6
  const day = jsDay === 0 ? 6 : jsDay - 1; // Monday=0 .. Sunday=6
  if (day > 3) return null;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(thursday) };
}

/** `kind` matters since migration 0050: nb_report_drafts's primary key is
 *  (report_date, kind), so a single date can hold a daily row and a weekly
 *  row (the week ending that day) at once. Defaults to "daily", the only
 *  kind this ever meant before weekly drafts existed. */
export async function getReportDraft(dateISO: string, kind: "daily" | "weekly" = "daily"): Promise<ReportDraft | null> {
  // raw() rather than query(): query()'s row type is constrained to carry an
  // `origin`, which is the synthetic-data marker on customer tables. This
  // table has no such column and never will, so claiming one to satisfy a
  // signature would be a lie in the type.
  const rows = await raw<ReportDraft>(
    `nb_report_drafts?select=*&report_date=eq.${encodeURIComponent(dateISO)}&kind=eq.${kind}&limit=1`,
  );
  return rows[0] ?? null;
}

/** Ask the Mac for a fresh build. Creates the row if today has none yet, which
 *  is the normal case: the day has just ended and nothing has run. */
export async function requestReportRebuild(dateISO: string): Promise<void> {
  await mutate(
    "nb_report_drafts",
    "POST",
    { report_date: dateISO, kind: "daily", rebuild_requested: true, status: "pending" },
    {},
    "resolution=merge-duplicates,return=minimal",
  );
}

/** Render (or re-render) the preview PDF from whatever payload is already
 *  stored -- no HubSpot pull, no status change (2026-08-28). requestReportRebuild
 *  forces status back to "pending", which is wrong for a sent day: it isn't up
 *  for re-review, Juan just wants to SEE it. Setting `dirty` is all
 *  field_report.py's --serve poller needs to pick this row up and render it,
 *  regardless of status -- see serve_drafts()'s dirty query, which was never
 *  status-filtered. Row must already exist (a sent/held/pending row does);
 *  a PATCH on a date with no row at all is a no-op. */
export async function requestPreviewRender(dateISO: string, kind: "daily" | "weekly" = "daily"): Promise<void> {
  await mutate(
    "nb_report_drafts",
    "PATCH",
    { dirty: true, updated_at: new Date().toISOString() },
    { report_date: `eq.${dateISO}`, kind: `eq.${kind}` },
    "return=minimal",
  );
}

/** Save his edits. `dirty` is what tells the Mac the preview PDF is now behind
 *  the payload, so the screen can say so instead of showing a stale map.
 *  `edited: true` is the other effect (migration 0049): this is the one path
 *  that merges his overlay into the payload, so it's the one signal that
 *  tells the 22:00 deadline a pre-send HubSpot refresh would now throw away
 *  something of his rather than just staleness. */
export async function saveReportDraftPayload(dateISO: string, payload: ReportPayload): Promise<void> {
  await mutate(
    "nb_report_drafts",
    "PATCH",
    { payload, dirty: true, edited: true, updated_at: new Date().toISOString() },
    { report_date: `eq.${dateISO}`, kind: "eq.daily" }, // only the daily row has editable overlay fields yet
    "return=minimal",
  );
}

/** `kind` matters since migration 0050 -- without it, approving/holding a
 *  weekly draft would PATCH a same-date daily row too (and vice versa),
 *  since report_date alone no longer picks one row. */
export async function setReportDraftStatus(
  dateISO: string,
  status: "pending" | "approved" | "held",
  kind: "daily" | "weekly" = "daily",
): Promise<void> {
  await mutate(
    "nb_report_drafts",
    "PATCH",
    { status, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { report_date: `eq.${dateISO}`, kind: `eq.${kind}` },
    "return=minimal",
  );
}

/** A short-lived link to the preview PDF, so the review is done against the
 *  real artifact, map and all, rather than a second rendering of the data. */
export async function signReportPreview(name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SB_URL}/storage/v1/object/sign/${REPORTS_BUCKET}/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 900 }),
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${SB_URL}/storage/v1${signedURL}`;
  } catch {
    return null;
  }
}
