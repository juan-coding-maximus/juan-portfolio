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
 * The trip regions. Coordinates are city centres, and the radius is a travel
 * envelope rather than a claim about a boundary: 25km from downtown Santa Cruz
 * covers Capitola, Soquel, Aptos and Scotts Valley, which is one working day's
 * driving. San Francisco is tighter because the city is dense and the bridge is
 * the real cost.
 */
export const REGIONS = {
  "santa-cruz": { label: "Santa Cruz", lat: 36.9741, lng: -122.0308, radiusM: 25000 },
  "san-francisco": { label: "San Francisco", lat: 37.7749, lng: -122.4194, radiusM: 20000 },
} as const;

export type RegionKey = keyof typeof REGIONS;

export function isRegionKey(v: string | undefined): v is RegionKey {
  return v !== undefined && Object.prototype.hasOwnProperty.call(REGIONS, v);
}

/**
 * Accounts within a region, nearest first.
 *
 * An account with no coordinates does not appear here at all. That is
 * deliberate and is the read-side half of geocode.py's refusal to write
 * approximate pins: a store missing from the list is visibly missing and
 * prompts a fix, whereas one placed at a postal centroid quietly reorders the
 * day and sends Juan to the wrong block.
 */
export async function listAccountsInRegion(region: RegionKey): Promise<Result<NearbyAccount>> {
  const r = REGIONS[region];
  return query<NearbyAccount>("rpc/nb_accounts_near", {
    p_lat: r.lat,
    p_lng: r.lng,
    p_radius_m: r.radiusM,
  });
}

/** How many accounts each region can actually route, for the picker. */
export async function regionCounts(): Promise<Record<RegionKey, number>> {
  const keys = Object.keys(REGIONS) as RegionKey[];
  const counts = await Promise.all(
    keys.map(async (k) => {
      try {
        return (await listAccountsInRegion(k)).data.length;
      } catch {
        return 0;
      }
    }),
  );
  return Object.fromEntries(keys.map((k, i) => [k, counts[i]])) as Record<RegionKey, number>;
}

/**
 * How many accounts cannot appear in ANY region view because they have no
 * coordinates. Surfaced next to a region list so a short list reads as
 * "incomplete data" rather than "small territory", which is the difference
 * between fixing an address and planning half a day.
 */
export async function countWithoutCoordinates(): Promise<number> {
  const rows = await raw<{ id: string }>("nb_accounts?select=id&lat=is.null&limit=5000");
  return rows.length;
}

export type Tier = "A" | "B" | "C" | "D";

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
  channel: string;
  lifecycle: string;
  do_not_visit: boolean;
  hubspot_company_id: string | null;
  tier: Tier | null;
  origin: Origin;
};

/**
 * Every account owned by `ownerName` in HubSpot that ALSO has a Places-verified
 * pin (see geocode.py's corroboration rule). Both conditions are real filters,
 * not display filters: an account with no coordinates is excluded here for the
 * same reason listAccountsInRegion excludes it, and an account owned by someone
 * else never appears on Juan's map no matter how well it is geocoded.
 *
 * tier is not a column on nb_accounts (0004's nb_v_account_tier computes it
 * from the fit/engagement scores), so it is fetched separately and joined
 * here rather than embedded in the query() call above, which only ever reads
 * one table.
 */
export async function listOwnerAccounts(ownerName = "Juan Arenas Martin"): Promise<Result<MapAccount>> {
  const [result, tiers] = await Promise.all([
    query<Omit<MapAccount, "tier">>("nb_accounts", {
      select:
        "id,name,street,city,state,postal,lat,lng,phone,channel,lifecycle,do_not_visit,hubspot_company_id,origin",
      owner_name: `eq.${ownerName}`,
      lat: "not.is.null",
      order: "name.asc",
      limit: 1000,
    }),
    raw<{ account_id: string; tier: Tier }>("nb_v_account_tier?select=account_id,tier&limit=1000"),
  ]);
  const tierById = new Map(tiers.map((t) => [t.account_id, t.tier]));
  return {
    ...result,
    data: result.data.map((a) => ({ ...a, tier: tierById.get(a.id) ?? null })),
  };
}

/** How many of ownerName's accounts exist locally but have no verified pin yet. */
export async function countOwnerWithoutCoordinates(ownerName = "Juan Arenas Martin"): Promise<number> {
  const rows = await raw<{ id: string }>(
    `nb_accounts?select=id&owner_name=eq.${encodeURIComponent(ownerName)}&lat=is.null&limit=5000`,
  );
  return rows.length;
}
