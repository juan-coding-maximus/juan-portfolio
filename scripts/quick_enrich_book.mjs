#!/usr/bin/env node
/**
 * Batch counterpart of the SDR panel's "Enrich further" button
 * (src/app/nutribiotic/lib/quick-enrich.ts): the same website + Google Places
 * + purchase-history pass, run once over every owned account that still has
 * no executive summary (current_state/future_state/impact all null), N at a
 * time (Juan, 2026-09-15: "serial-enrich with at least 5 agents at the same
 * time").
 *
 * Talks to Supabase/Places/Anthropic directly with the service-role key, the
 * same way the bridges/nutribiotic/*.py scripts do, because this runs outside
 * a Next request and cannot go through the session-gated DAL (dal.ts's
 * verifySession() needs a real cookie). The Places/hours logic here is a
 * direct port of lib/places.ts and the tool schema/prompt is a direct port of
 * lib/quick-enrich.ts; if either changes, mirror the change here too.
 *
 * Same no-fabrication + tier-ladder + blank-fill rules as the button: hours
 * only overwrite a weaker tier (places < website < manual_note), and the gap
 * summary is only written when all three fields are still null on the live
 * row at write time.
 *
 * Usage:
 *   node --env-file=<path-with-real-secrets> scripts/quick_enrich_book.mjs [--limit N] [--concurrency N] [--dry]
 */
import Anthropic from "@anthropic-ai/sdk";

const SB_URL = process.env.NB_SUPABASE_URL;
const SB_KEY = process.env.NB_SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.NB_PLACES_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NB_SUPABASE_URL / NB_SUPABASE_SERVICE_ROLE_KEY are not set. Pass an env file with real secrets via --env-file.");
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const JUAN_OWNER_ID = "36242368";
const HOURS_TIER_RANK = { manual_note: 0, website: 1, places: 2 };

function flag(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const LIMIT = parseInt(flag("limit", "2000"), 10);
const CONCURRENCY = parseInt(flag("concurrency", "6"), 10);
const DRY = process.argv.includes("--dry");
const DEBUG = process.argv.includes("--debug");
const ONLY_IDS = flag("ids", null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

async function sbGet(table, params) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${new URLSearchParams(params)}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${table} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function sbPatch(table, body, params) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${new URLSearchParams(params)}`, {
    method: "PATCH",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// --- Places (New) Text Search, ported from src/app/nutribiotic/lib/places.ts ---
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.regularOpeningHours.periods",
  "places.businessStatus",
].join(",");
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const CALIFORNIA_BOUNDS = { low: { latitude: 32.4, longitude: -124.6 }, high: { latitude: 42.1, longitude: -114.0 } };
const NEAR_RADIUS_METERS = 24_140;

function openingHoursFromPlace(place) {
  const periods = place.regularOpeningHours?.periods ?? [];
  if (periods.length === 0) return null;
  const out = Object.fromEntries(DAYS.map((d) => [d, []]));
  const fmt = (h, m) => `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
  for (const p of periods) {
    const day = p.open?.day;
    if (day == null) continue;
    out[DAYS[day]].push([fmt(p.open?.hour, p.open?.minute), p.close ? fmt(p.close.hour, p.close.minute) : "23:59"]);
  }
  return out;
}

async function searchPlace(query, near) {
  if (!PLACES_KEY) return null;
  try {
    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        languageCode: "en",
        regionCode: "US",
        ...(near
          ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: NEAR_RADIUS_METERS } } }
          : { locationRestriction: { rectangle: CALIFORNIA_BOUNDS } }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    return { businessStatus: place.businessStatus ?? null, businessHours: openingHoursFromPlace(place) };
  } catch {
    return null;
  }
}

async function fetchWebsiteText(rawUrl) {
  try {
    const href = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const res = await fetch(href, {
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NutriBioticFieldRep/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 6000) || null;
  } catch {
    return null;
  }
}

// Human dates in, human dates out (Juan, 2026-09-16): the model echoes
// whatever date shape it's shown straight into current_state/future_state,
// so a raw ISO string here is a raw ISO string baked into the stored summary
// forever. Ported from lib/ui.ts's exactDate.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function exactDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function buildPurchaseDigest(orders, lines) {
  if (orders.length === 0) return "Purchase history: no orders on file.";
  const totalRevenue = orders.reduce((s, o) => s + o.revenue_cents, 0) / 100;
  const lastOrder = orders[0];
  const byProduct = new Map();
  for (const l of lines) {
    if (!l.product_name) continue;
    const cur = byProduct.get(l.product_name) ?? { qty: 0, revenue: 0 };
    cur.qty += l.qty ?? 0;
    cur.revenue += l.line_revenue_cents / 100;
    byProduct.set(l.product_name, cur);
  }
  const top = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
  const productText = top.map(([n, v]) => `${n} ($${v.revenue.toFixed(0)} lifetime)`).join("; ");
  return (
    `Purchase history: ${orders.length} orders on file, $${totalRevenue.toFixed(0)} lifetime revenue, ` +
    `last order ${exactDate(lastOrder.ordered_at)}. Products bought: ${productText || "none itemized"}.`
  );
}

// Mirrors lib/quick-enrich.ts's buildMeetingDigest (Juan, 2026-09-15: "use the
// info from the meetings as highest quality info to build the executive
// summaries"). Same origin/kind filter as sdr-actions.ts's panel.
function buildMeetingDigest(activities) {
  const real = activities.filter((a) => a.origin !== "enriched" && (a.kind === "call" || a.kind === "meeting"));
  if (real.length === 0) return "Meetings and calls on file: none yet.";
  const lines = real.slice(0, 8).map((a) => `${a.kind} ${exactDate(a.at)}: ${a.detail ?? "no detail logged"}`);
  return `Meetings and calls on file, HIGHEST QUALITY SOURCE (real, said by the account, not a scrape):\n${lines.join("\n")}`;
}

const ENRICH_TOOL = {
  name: "quick_enrich_account",
  description:
    "Extract accurate business hours from the website text if explicitly stated there, and write a grounded gap-selling summary from the evidence given. Every field must come only from that evidence; return null rather than invent anything.",
  input_schema: {
    type: "object",
    properties: {
      hours_found_on_website: { type: "boolean", description: "True only if the website text block explicitly states operating hours." },
      hours: {
        type: ["object", "null"],
        description:
          "Only when hours_found_on_website is true: one key per day (mon,tue,wed,thu,fri,sat,sun), each an array of [open,close] 24-hour HH:MM pairs, an empty array for a day stated as closed. Include every day the website states; omit a day it says nothing about. Null when hours_found_on_website is false.",
        additionalProperties: { type: "array", items: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 } },
      },
      current_state: {
        type: ["string", "null"],
        description:
          "One sentence naming the actual angle a rep opens the call with: what kind of business this really is and the specific context that changes how to sell it (e.g. a supplement retailer operating inside a gym, a pharmacy already carrying one line but not another), grounded only in the evidence given, meetings and calls weighted highest and used first whenever any exist. Never a restatement of a Places business-status flag or a bare order-count fact (e.g. 'listed as OPERATIONAL' or 'has no orders on file' said on its own, with nothing else, is not an angle). Null, not a restated fact, if the evidence is too thin to say anything a rep couldn't already see on this screen.",
      },
      future_state: {
        type: ["string", "null"],
        description:
          "One sentence naming a SPECIFIC opportunity implied directly by a gap in the evidence given (a lapsed product line, a category their site, reviews, or a meeting mention that they don't currently order from us). Never a generic pitch line, and never just 'they have zero orders so there is upside'; that is the same fact as current_state restated as an opportunity, not a new one. Null if no specific gap is evidenced.",
      },
      impact: {
        type: ["string", "null"],
        description:
          "One sentence on what closing that gap is worth, grounded in the numbers already given (revenue, order cadence) where available, otherwise tied to a concrete detail in the evidence, ideally a meeting detail (something said, a stated intent, a stated objection). Never a generic 'this represents new revenue from an untapped account' line; that is true of every account with zero orders and says nothing about this one. Null if current_state and future_state are both null, or if all that's left to say is that generic line.",
      },
    },
    required: ["hours_found_on_website", "hours", "current_state", "future_state", "impact"],
  },
};

async function enrichOne(account) {
  const [orders, near] = [
    await sbGet("nb_orders", { select: "id,ordered_at,revenue_cents,order_type", account_id: `eq.${account.id}`, order: "ordered_at.desc", limit: "500" }),
    account.lat != null && account.lng != null ? { lat: account.lat, lng: account.lng } : undefined,
  ];
  let lines = [];
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id).join(",");
    lines = await sbGet("nb_order_lines", { select: "id,order_id,product_name,qty,line_revenue_cents", order_id: `in.(${ids})` });
  }

  const placeQuery = `${account.name}, ${[account.street, account.city, account.state].filter(Boolean).join(", ")}`;
  const [place, siteText, activities] = await Promise.all([
    searchPlace(placeQuery, near),
    account.website ? fetchWebsiteText(account.website) : Promise.resolve(null),
    sbGet("nb_activities", { select: "at,kind,detail,origin", account_id: `eq.${account.id}`, order: "at.desc", limit: "30" }),
  ]);

  const evidence = [
    `Account: ${account.name} (${account.channel}, ${account.lifecycle}), ${[account.city, account.state].filter(Boolean).join(", ") || "city unknown"}.`,
    buildMeetingDigest(activities),
    buildPurchaseDigest(orders, lines),
    place
      ? `Google Places match: status=${place.businessStatus ?? "unknown"}, hours on file at Places=${place.businessHours ? JSON.stringify(place.businessHours) : "none"}.`
      : "Google Places: no confident match found.",
    siteText
      ? `Website text (${account.website}):\n${siteText}`
      : account.website
        ? `Website is on file (${account.website}) but could not be read just now (fetch failed or blocked).`
        : "No website on file.",
    "No executive summary on file yet.",
  ].join("\n\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 700,
    system:
      "You are doing a 30-second field-rep lookup on one account right before a call, using ONLY the evidence blocks in the " +
      "user message. Never invent a fact, hour, product, or opportunity that is not present in that evidence. Extract hours " +
      "only if the website text states them explicitly; Google Places' own hours are applied separately and are not yours to " +
      "restate. The meetings-and-calls block is the highest-quality evidence given, real words from the account, not a scrape, " +
      "and IS Juan's own recent experience with this business: build the gap summary from it first whenever it has anything " +
      "usable, and only fall back to the website/Places/purchase-history blocks to fill in what the meetings didn't cover. " +
      "When meetings conflict with the website or Places, believe the meetings block. The gap summary (current_state/" +
      "future_state/impact) must each name something concrete a rep does not already see elsewhere on this screen (this " +
      "account already shows its own order count, last-order date, and Places status as separate facts, so restating any of " +
      "those, in any words, is not a summary, it's noise). A sentence whose only content is a business-status flag ('listed as " +
      "OPERATIONAL') or a bare zero-orders fact ('has no orders on file', 'represents entirely new revenue from an untapped " +
      "account') is exactly the kind of generic filler to avoid: it is true of hundreds of other accounts and gives no edge on " +
      "this one. If the evidence (beyond a meeting) gives you nothing more specific than that, return null, never that generic " +
      "sentence; a blank field a rep skips past in a second beats a full field that wastes their time. " +
      "If you name a date in any field, write it the way a rep would say it out loud (e.g. 'Feb 16, 2026'), never as " +
      "digits-and-dashes (never '2026-02-16').",
    messages: [{ role: "user", content: evidence }],
    tools: [ENRICH_TOOL],
    tool_choice: { type: "tool", name: "quick_enrich_account" },
  });
  const toolUse = msg.content.find((b) => b.type === "tool_use");
  const out = toolUse ? toolUse.input : null;

  const websiteHours = out?.hours_found_on_website ? out.hours : null;
  const businessHours = websiteHours ?? place?.businessHours ?? null;
  const hoursSource = websiteHours ? "website" : place?.businessHours ? "places" : null;

  if (DEBUG) {
    console.log(`\n--- ${account.name} ---\nEVIDENCE:\n${evidence}\nOUTPUT: ${JSON.stringify(out, null, 2)}\n`);
  }

  if (DRY) {
    return { wroteHours: !!businessHours, wroteSummary: !!(out?.current_state || out?.future_state || out?.impact), dry: true, out, hoursSource };
  }

  // Re-read the live row right before writing, same discipline as
  // dal.ts's applyAccountFacts/applyQuickEnrichment: a concurrent pass
  // (the button, or another run of this script) may have filled the cell
  // in the seconds since the query above ran.
  const [liveRow] = await sbGet("nb_accounts", {
    select: "id,business_hours,current_state,future_state,impact,enrichment_status",
    id: `eq.${account.id}`,
    limit: "1",
  });
  if (!liveRow) return { wroteHours: false, wroteSummary: false, error: "row disappeared" };

  const patch = {};
  const status = { ...(liveRow.enrichment_status || {}) };
  let wroteHours = false;
  let wroteSummary = false;

  if (businessHours && hoursSource) {
    const existingTier = liveRow.enrichment_status?.business_hours?.source_tier;
    const existingRank = existingTier ? (HOURS_TIER_RANK[existingTier] ?? 99) : 99;
    if (HOURS_TIER_RANK[hoursSource] < existingRank) {
      patch.business_hours = businessHours;
      status.business_hours = {
        source_tier: hoursSource,
        found_by: hoursSource === "website" ? `sdr_quick_enrich_book: ${account.website}` : "sdr_quick_enrich_book: google_places",
        at: new Date().toISOString(),
      };
      wroteHours = true;
    }
  }

  if (!liveRow.current_state && !liveRow.future_state && !liveRow.impact && (out?.current_state || out?.future_state || out?.impact)) {
    patch.current_state = out.current_state ?? null;
    patch.future_state = out.future_state ?? null;
    patch.impact = out.impact ?? null;
    status.gap_summary = { source_tier: "sdr_quick_enrich_book", found_by: "sdr_quick_enrich_book: website + google_places + purchase history", at: new Date().toISOString() };
    wroteSummary = true;
  }

  if (Object.keys(patch).length > 0) {
    patch.enrichment_status = status;
    await sbPatch("nb_accounts", patch, { id: `eq.${account.id}` });
  }

  return { wroteHours, wroteSummary, out, hoursSource };
}

async function main() {
  const qualifying = await sbGet("nb_accounts", {
    select: "id,name,channel,lifecycle,street,city,state,postal,lat,lng,website,enrichment_status,current_state,future_state,impact",
    ...(ONLY_IDS
      ? { id: `in.(${ONLY_IDS.join(",")})` }
      : {
          hubspot_owner_id: `eq.${JUAN_OWNER_ID}`,
          chain_excluded: "eq.false",
          practice_excluded: "eq.false",
          closed_at: "is.null",
          lifecycle: "neq.waypoint",
          current_state: "is.null",
          future_state: "is.null",
          impact: "is.null",
        }),
    limit: String(LIMIT),
  });

  console.log(`${qualifying.length} owned accounts with no executive summary on file. Concurrency ${CONCURRENCY}${DRY ? " (dry run)" : ""}.`);

  let done = 0;
  let wroteHoursCount = 0;
  let wroteSummaryCount = 0;
  let errorCount = 0;
  const queue = [...qualifying];

  async function worker(id) {
    while (queue.length > 0) {
      const account = queue.shift();
      if (!account) return;
      try {
        const r = await enrichOne(account);
        done++;
        if (r.wroteHours) wroteHoursCount++;
        if (r.wroteSummary) wroteSummaryCount++;
        console.log(
          `[w${id}] (${done}/${qualifying.length}) ${account.name}: ${r.wroteSummary ? "summary filled" : "no summary"}${r.wroteHours ? ", hours " + r.hoursSource : ""}`,
        );
      } catch (err) {
        done++;
        errorCount++;
        console.error(`[w${id}] (${done}/${qualifying.length}) ${account.name}: ERROR ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, qualifying.length) }, (_, i) => worker(i + 1)));

  console.log(`\nDone. ${wroteSummaryCount}/${qualifying.length} summaries filled, ${wroteHoursCount} hours updated, ${errorCount} errors.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
