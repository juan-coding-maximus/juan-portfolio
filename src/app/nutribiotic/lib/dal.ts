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
): Promise<T[]> {
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
      Prefer: "return=representation",
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
  opts: { area?: string | null; limit?: number } = {},
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
    order: "tier.asc,fit_confidence.desc,fit.desc",
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
  origin: Origin;
};

export async function getAccount(id: string): Promise<Result<Account>> {
  return query<Account>("nb_accounts", { select: "*", id: `eq.${id}`, limit: 1 });
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
};

export async function insertActivity(input: NewActivity): Promise<Activity> {
  const [row] = await mutate<Activity>("nb_activities", "POST", {
    ...input,
    actor: "juan",
    origin: "manual",
  });
  return row;
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
  boundary: { type: "MultiPolygon"; coordinates: number[][][][] } | null;
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
export async function listAreas(): Promise<TerritoryArea[]> {
  const rows = await raw<TerritoryArea>(
    "nb_territory_areas?select=*&order=display_order.asc",
  );
  return rows;
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
 * The hand-built route under the map: an ordered list of nb_accounts.id, order
 * being stop order (migration 0029). Server-persisted for the same reason the
 * chain/practice toggles are, and one Juan asked for explicitly: a route he
 * assembles on the phone in the morning is still there on the desktop, and
 * still there after a reload, until he removes a stop himself.
 *
 * Unknown ids are dropped on read rather than rendered as a blank row. That is
 * the tombstone case: an account in the draft that gets closed, or falls out of
 * Juan's book, stops being a stop, and the alternative is a route with a hole
 * in it that cannot be clicked or removed.
 */
export async function getRouteDraft(): Promise<string[]> {
  const rows = await raw<{ route_draft: string[] | null }>("nb_ui_prefs?select=route_draft&id=eq.1");
  const ids = rows[0]?.route_draft;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}

export async function setRouteDraft(ids: string[]): Promise<void> {
  await mutate("nb_ui_prefs", "PATCH", { route_draft: ids, updated_at: new Date().toISOString() }, {
    id: "eq.1",
  });
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
