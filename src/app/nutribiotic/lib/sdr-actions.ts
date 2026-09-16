"use server";

/**
 * SDR page actions. The page schedules calls/visits into days, dials out with
 * a plain tel: link (see lib/sdr-ui.tsx for why nothing fancier), logs what
 * happened through the SAME extractor /visit uses, and can flag an account to
 * Outbound. Nothing here files a second, competing record of what happened on
 * a call, that stays touchpoint.ts's job alone (nutribiotic/AGENTS.md,
 * Capture doors).
 */

import { revalidatePath } from "next/cache";
import {
  addOwnedAccountToRouteDraft,
  findMarketingFile,
  getAccount,
  insertSdrScheduleItem,
  listActivities,
  listContacts,
  listPurchases,
  rescheduleSdrScheduleItem,
  searchOwnedAccounts,
  searchOwnedContacts,
  setSdrScheduleStatus,
  type NewSdrScheduleItem,
  type PurchaseLine,
  type PurchaseOrder,
  type SdrPriority,
  type SdrScheduleItem,
} from "./dal";
import type { Readiness } from "./priority";
import { enrichAccountQuickly, type QuickEnrichResult } from "./quick-enrich";

export type { QuickEnrichResult };

export type SdrSearchHit = {
  accountId: string;
  accountName: string;
  city: string | null;
  phone: string | null;
  /** Set only when this hit matched on a PERSON's name rather than the
   *  business name, so the result line can say who, at which business,
   *  instead of just the business twice. */
  contactName: string | null;
  contactTitle: string | null;
  /** nb_accounts.area, so a row added straight from this search lands in the
   *  right area group on the queue without waiting for a server render. Null
   *  on a contact-only hit whose account row was not read. */
  area: string | null;
};

/**
 * One search bar, both a business name and a person's name, no mode toggle
 * (Juan's ask, 2026-09-08: "without any toggles"). Runs both lookups in
 * parallel and dedupes by account, a company-name hit and a person-name hit
 * on the SAME account show once, not twice, with the contact attached to
 * the account row rather than as a second card.
 */
export async function searchSdrClients(q: string): Promise<SdrSearchHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const [accounts, contacts] = await Promise.all([searchOwnedAccounts(query, 6), searchOwnedContacts(query, 6)]);
  const byAccount = new Map<string, SdrSearchHit>();
  for (const a of accounts.data) {
    byAccount.set(a.id, { accountId: a.id, accountName: a.name, city: a.city, phone: a.phone, area: a.area, contactName: null, contactTitle: null });
  }
  for (const c of contacts.data) {
    const existing = byAccount.get(c.account_id);
    if (existing && !existing.contactName) {
      byAccount.set(c.account_id, { ...existing, contactName: c.name, contactTitle: c.title });
    } else if (!existing) {
      byAccount.set(c.account_id, {
        accountId: c.account_id,
        accountName: c.account_name,
        city: c.city,
        phone: c.phone,
        area: null,
        contactName: c.name,
        contactTitle: c.title,
      });
    }
  }
  return [...byAccount.values()].slice(0, 8);
}

/**
 * channel -> a substring of the one real collateral PDF in the "marketing"
 * bucket (~/Desktop/NutriBiotic/15-sales-collateral, synced by
 * bridges/nutribiotic/sync_marketing_files.py) that fits what this kind of
 * account actually is. Juan, 2026-09-15: a call brief with "an angle" means
 * naming which real piece to bring, not a generic pitch line. Deliberately a
 * fixed lookup rather than a model guess, findMarketingFile() below still
 * confirms the file is actually in the bucket before the panel claims it
 * exists (AGENTS.md P2, no fabrication). A channel absent from this map (or
 * unmapped by CHANNEL_TYPE in account-filters.ts) gets no recommendation
 * rather than a forced, badly-fitting one.
 */
const CHANNEL_PACK_HINT: Record<string, string> = {
  pharmacy: "Pharmacy Vitamin",
  grocery: "Grocery GSE",
  specialty: "Grocery GSE",
  holistic_retail: "Grocery GSE",
  mass_retail: "Grocery GSE",
  online_retailer: "Grocery GSE",
  coop: "Grocery GSE",
  gym: "Sports Nutrition",
  nutrition_club: "Sports Nutrition",
  spa_beauty: "Spa Partner",
  clinic: "Pharmacy Vitamin",
  holistic_health_services: "Pharmacy Vitamin",
};

export type PurchaseSummaryItem = {
  name: string;
  qty: number;
  revenueCents: number;
  /** This same product's share of the account's 3 most recent orders, so the
   *  panel can show "usually X per visit" beside the lifetime total. Zero
   *  when the account hasn't ordered it in its last 3 orders even though it
   *  has lifetime history (a lapsed line, worth naming as a gap, not hiding). */
  last3Qty: number;
  last3RevenueCents: number;
};

export type PurchaseSummary = {
  orderCount: number;
  /** Top 5 by lifetime net units, same rank rule account-detail.tsx's
   *  Purchases card already uses. Net, not gross: a return demotes a line
   *  rather than inflating it. */
  topItems: PurchaseSummaryItem[];
  /** Everything past the top 5, collapsed to names only ("small amounts of
   *  X, Y, Z"), Juan's own phrase, 2026-09-15: the tail of the order history
   *  is worth naming so nothing on file looks hidden, not worth a number
   *  each. */
  smallItemNames: string[];
};

/**
 * Same lifetime-units ranking account-detail.tsx's Purchases card computes
 * inline (dal.ts's listPurchases has no shared aggregator), plus a last-3-
 * orders cut the SDR panel needs and the account modal doesn't. Net qty/
 * revenue across ALL orders decides lifetime rank; the most recent 3 orders'
 * ids decide the last3 columns. Items that net to zero (bought then fully
 * returned) are dropped from both lists, same as account-detail.tsx.
 */
function summarizePurchases(orders: PurchaseOrder[], lines: PurchaseLine[]): PurchaseSummary | null {
  if (orders.length === 0) return null;
  const last3OrderIds = new Set(orders.slice(0, 3).map((o) => o.id));
  const totals = new Map<string, PurchaseSummaryItem>();
  for (const l of lines) {
    const name = l.product_name ?? "Item";
    const cur = totals.get(name) ?? { name, qty: 0, revenueCents: 0, last3Qty: 0, last3RevenueCents: 0 };
    cur.qty += l.qty ?? 0;
    cur.revenueCents += l.line_revenue_cents;
    if (last3OrderIds.has(l.order_id)) {
      cur.last3Qty += l.qty ?? 0;
      cur.last3RevenueCents += l.line_revenue_cents;
    }
    totals.set(name, cur);
  }
  const items = [...totals.values()].filter((t) => t.qty !== 0).sort((a, b) => b.qty - a.qty);
  return {
    orderCount: orders.length,
    topItems: items.slice(0, 5),
    smallItemNames: items.slice(5).map((t) => t.name),
  };
}

export type SdrAccountPanel = {
  id: string;
  name: string;
  channel: string;
  /** nb_accounts.area, the territory area id. Null on an account
   *  assign_areas.py hasn't placed yet (no city match, no coordinates). */
  area: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  /** For the Google Maps link when the address is too thin to search on.
   *  Null on an account with no verified pin, which is a real state: the
   *  link then falls back to the business name, never to a made-up point. */
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  lifecycle: string;
  /** HubSpot's own hs_lead_status, pull-only mirror (migration 0028). What
   *  the panel labels "Status": HQ's own working state for the account, not
   *  the OS's behaviour-derived lifecycle above (Juan, 2026-09-15: "status is
   *  lead status"). */
  leadStatus: string | null;
  potentialJuan: string | null;
  /** The rep's own readiness tag (migration 0069), set from this same panel's
   *  capture box. Null means no rep has tagged it yet. */
  readiness: Readiness | null;
  quirks: string | null;
  /** The gap-selling triple (nb_accounts.current_state/future_state/impact),
   *  the same three fields account-detail.tsx's "The gap" card reads. Null
   *  on every account as of 2026-09-14 (see lib/priority.ts's own comment on
   *  this), nobody has run discovery to fill them yet, not a UI gap. */
  currentState: string | null;
  futureState: string | null;
  impact: string | null;
  lastOrderAt: string | null;
  lifetimeRevenue: number | null;
  trailingRevenue: number | null;
  expectedReorderAt: string | null;
  /** Null when the account has no loaded order history at all (146 of 459
   *  accounts do, see dal.ts's listPurchases), a real gap, not a zero. */
  purchases: PurchaseSummary | null;
  /** The one real collateral piece (findMarketingFile) that fits this
   *  account's channel, from CHANNEL_PACK_HINT above. Null on a channel with
   *  no mapped pack, or when the bucket doesn't actually have a matching
   *  file, never a name the bucket can't back up. */
  recommendedPack: { label: string; url: string } | null;
  /** Google Places hours, same shape account-detail.tsx already renders.
   *  Null on an account the enricher hasn't reached yet, a real gap, never a
   *  guess (HARD RULE 1). */
  businessHours: Record<string, string[][]> | null;
  hubspotCompanyId: string | null;
  contacts: { id: string; name: string; title: string | null; phone: string | null; email: string | null; isDecisionMaker: boolean }[];
  /** Calls and meetings only, most recent first, shown in full (Juan,
   *  2026-09-15: "I only want to see the visits or call information"). Also
   *  drops the enrichment pipeline's own system notes, geocode.py's
   *  "Geocoded from Google Places..." chief among them, which used to read as
   *  if they were something that happened with the client; both filters
   *  applied together at the query below. */
  activities: { at: string; kind: string; detail: string | null }[];
};

/**
 * The account context for one SDR call, deliberately narrow. Juan's ask,
 * 2026-09-08: "a lot of information about the business... but less crowded,
 * only the important information", not the full /nutribiotic/account/[id]
 * page (activities table, order history, everything AccountDetailBody
 * shows). This picks the fields that matter for a cold or warm call, in the
 * seconds before he dials: what the business is, how to reach it, what's
 * already on file at HubSpot, who's there, and the one most recent thing
 * that actually happened.
 */
export async function getSdrAccountPanel(accountId: string): Promise<SdrAccountPanel | null> {
  const [accRes, contactsRes, activitiesRes, purchases] = await Promise.all([
    getAccount(accountId),
    listContacts(accountId),
    listActivities(accountId, 60),
    listPurchases(accountId),
  ]);
  const a = accRes.data[0];
  if (!a) return null;
  const realActivities = activitiesRes.data.filter(
    (act) => act.origin !== "enriched" && (act.kind === "call" || act.kind === "meeting"),
  );
  return {
    id: a.id,
    name: a.name,
    channel: a.channel,
    area: a.area,
    street: a.street,
    city: a.city,
    state: a.state,
    postal: a.postal,
    lat: a.lat,
    lng: a.lng,
    phone: a.phone,
    website: a.website,
    lifecycle: a.lifecycle,
    leadStatus: a.lead_status,
    potentialJuan: a.potential_juan,
    readiness: a.readiness,
    quirks: a.quirks,
    currentState: a.current_state,
    futureState: a.future_state,
    impact: a.impact,
    lastOrderAt: a.last_order_at,
    lifetimeRevenue: a.lifetime_revenue,
    trailingRevenue: a.trailing_12m_revenue,
    expectedReorderAt: a.expected_reorder_at,
    purchases: summarizePurchases(purchases.orders, purchases.lines),
    // Loaded separately, after the panel is already on screen: see
    // getRecommendedPack below.
    recommendedPack: null,
    businessHours: a.business_hours,
    hubspotCompanyId: a.hubspot_company_id,
    contacts: contactsRes.data.map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed contact",
      title: c.title,
      phone: c.phone,
      email: c.email,
      isDecisionMaker: c.is_decision_maker,
    })),
    activities: realActivities.map((act) => ({ at: act.at, kind: act.kind, detail: act.detail })),
  };
}

/**
 * The recommended marketing pack, off getSdrAccountPanel's critical path
 * (Juan, 2026-09-15: the panel needs to load "super quick" the moment a row
 * is tapped). findMarketingFile makes two sequential Storage HTTP calls
 * (list the bucket, then sign a URL), which on a cellular connection was the
 * slowest part of opening a prospect by a wide margin despite being the
 * least useful thing on the panel at that instant. Called separately by
 * sdr-ui.tsx right after the panel itself renders, and merged in when it
 * resolves, the same progressive-fill pattern runQuickEnrichment already
 * uses below.
 */
export async function getRecommendedPack(accountId: string): Promise<{ label: string; url: string } | null> {
  const accRes = await getAccount(accountId);
  const a = accRes.data[0];
  if (!a) return null;
  const packHint = CHANNEL_PACK_HINT[a.channel];
  return packHint ? findMarketingFile(packHint) : null;
}

/**
 * The panel's "Enrich further" button: a ~30-second look at the website,
 * Google Places, and this account's own order history, right before Juan
 * dials. See lib/quick-enrich.ts for the pass itself and dal.ts's
 * applyQuickEnrichment for the tier ladder / blank-fill write rules that
 * govern what actually lands on the row.
 */
export async function runQuickEnrichment(accountId: string): Promise<QuickEnrichResult> {
  const result = await enrichAccountQuickly(accountId);
  if (result.wroteHours || result.wroteSummary) revalidatePath("/nutribiotic/sdr");
  return result;
}

export async function searchSdrAccounts(query: string) {
  const res = await searchOwnedAccounts(query);
  return res.data;
}

export async function addSdrScheduleItem(input: NewSdrScheduleItem): Promise<SdrScheduleItem> {
  const row = await insertSdrScheduleItem(input);
  revalidatePath("/nutribiotic/sdr");
  return row;
}

/**
 * "Add to SDR" from a map pin (Juan, 2026-09-08). The map is where he decides
 * an account is worth working; the SDR queue is where the work gets done. The
 * gap between the two used to be retyping the name into the queue's own search.
 *
 * DATED TODAY, deliberately. The map card has no room for a date picker beside
 * a three-way priority, and the queue is a rail of days a row can be dragged
 * across in one tap (0063's reschedule). Landing it on today and letting him
 * move it is fewer decisions at the moment of tapping than asking for a day he
 * has not thought about yet.
 *
 * A CALL, not a visit: this is the desk queue. A stop he wants to drive to is
 * the button directly above it on the same card, which writes route_draft.
 *
 * Scope (HARD RULE 2) is asserted inside insertSdrScheduleItem, against the
 * live row, not here against what the client sent.
 *
 * RETURNS A RESULT, NEVER THROWS. Next.js redacts a Server Action's thrown
 * error message before it reaches the client (production strips it to a
 * generic digest), which is exactly why the map card used to show a static
 * "Could not queue it" no matter what actually went wrong (a real scope
 * refusal from insertSdrScheduleItem read identically to a network blip).
 * Catching here and handing the real reason back as data survives that
 * boundary, the same pattern lib/engagement-actions.ts already uses for the
 * HubSpot filing queue.
 */
export async function addAccountToSdr(
  accountId: string,
  priority: SdrPriority,
  scheduledDate: string,
): Promise<{ ok: true; row: SdrScheduleItem } | { ok: false; error: string }> {
  try {
    const row = await insertSdrScheduleItem({
      account_id: accountId,
      kind: "call",
      scheduled_date: scheduledDate,
      priority,
    });
    revalidatePath("/nutribiotic/sdr");
    return { ok: true, row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * "Add to route" from an SDR row (Juan, 2026-09-08): pick a day, optionally
 * state a time, and the stop lands on the map's own hand-built route.
 *
 * THE SAME WRITE PATH THE MAP USES, on purpose: nb_ui_prefs.route_draft, the
 * column RouteProvider reads and route_draft_write.py writes (memory
 * reference_nutribiotic-route-map-write). Nothing here invents a second list of
 * planned stops. The optional time goes to route_stop_times (0065), where
 * RoutePanel reads it as an anchor rather than as a label.
 *
 * THE SDR ROW IS NOT CLOSED BY THIS. Scheduling a drive is not having made the
 * call, and marking it done here would silently record a touchpoint that never
 * happened. It stays pending until Juan closes it himself or logs through the
 * capture box (HARD RULE 1).
 */
export async function addSdrItemToRoute(
  accountId: string,
  date: string,
  at?: string | null,
): Promise<{ added: boolean; alreadyThere: boolean }> {
  const res = await addOwnedAccountToRouteDraft(accountId, date, at ?? null);
  revalidatePath("/nutribiotic/map");
  return res;
}

/**
 * Move one scheduled call or visit to another day. Writes
 * nb_sdr_schedule.scheduled_date, the field the queue actually groups and
 * orders by, and stamps rescheduled_at so the 30-minute follow-through pass
 * knows a human has already answered for this account and stands down (see
 * dal.ts's rescheduleSdrScheduleItem and bridges/nutribiotic/follow_through.py).
 */
export async function rescheduleSdrItem(id: string, scheduledDate: string): Promise<SdrScheduleItem> {
  const row = await rescheduleSdrScheduleItem(id, scheduledDate);
  revalidatePath("/nutribiotic/sdr");
  return row;
}

/** 'done' with no activity id is a real, if rarer, case: Juan marks a row done
 * by hand (he called from his phone instead, say) without routing it through
 * the capture box. That is honest, not a gap, so completedActivityId stays
 * optional rather than required. */
export async function updateSdrScheduleStatus(
  id: string,
  status: "pending" | "done" | "skipped",
  completedActivityId?: number,
): Promise<SdrScheduleItem> {
  const row = await setSdrScheduleStatus(id, status, completedActivityId);
  revalidatePath("/nutribiotic/sdr");
  return row;
}

/**
 * "Tell outbound a client needs an email with specifics" used to be a manual
 * flag here. Juan's ask, 2026-09-08: it should come from the call itself, not
 * a second thing to type. That's now touchpoint.ts's outreach_asks, filed the
 * moment the call is logged through the SAME capture box this page already
 * uses. This page's job is just to show what landed there, see
 * lib/sdr-ui.tsx's ViewInOutbound, which opens /nutribiotic/outbound?account=
 * in a new tab instead of flagging anything itself.
 */
