/**
 * The SDR panel's "Enrich further" button (sdr-ui.tsx): a ~30-second look at
 * an account right before Juan dials it, so the hours he's about to trust and
 * the executive summary he's about to read aren't stale or blank.
 *
 * NOT the full nutribiotic-enricher agent. That one has WebSearch/WebFetch,
 * runs a whole tier chain for names/phones/contacts, and takes minutes. This
 * is a single request-response pass, scoped to exactly what a rep needs in
 * the seconds before a call: accurate hours, and the gap-selling triple
 * (current_state/future_state/impact) account-detail.tsx's "The gap" card and
 * this same panel already render. Three sources, in parallel: the business's
 * own website (if one is on file), Google Places, and our own order history
 * (nb_orders/nb_order_lines) via listPurchases.
 *
 * NO FABRICATION (AGENTS.md P2). The model sees only what these three sources
 * actually returned and is told, in the tool schema itself, to return null
 * rather than a plausible-sounding guess. applyQuickEnrichment then enforces
 * the department's own tier ladder and blank-fill rule on the write side, so
 * even a well-grounded finding can't demote a stronger one already on file.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  applyQuickEnrichment,
  getAccount,
  listActivities,
  listPurchases,
  type Activity,
  type PurchaseLine,
  type PurchaseOrder,
} from "./dal";
import { searchPlaces, type PlaceCandidate } from "./places";
import { exactDate } from "./ui";

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

export type QuickEnrichResult = {
  ok: boolean;
  error?: string;
  businessHours: Record<string, string[][]> | null;
  hoursSource: "website" | "places" | null;
  currentState: string | null;
  futureState: string | null;
  impact: string | null;
  wroteHours: boolean;
  wroteSummary: boolean;
  /** Set when a finding existed but the write was correctly skipped, so the
   *  button's result note can say why nothing changed instead of looking
   *  like it silently did nothing. */
  skippedReason?: string;
};

const ENRICH_TOOL = {
  name: "quick_enrich_account",
  description:
    "Extract accurate business hours from the website text if explicitly stated there, and write a grounded gap-selling summary from the evidence given. Every field must come only from that evidence; return null rather than invent anything.",
  input_schema: {
    type: "object" as const,
    properties: {
      hours_found_on_website: {
        type: "boolean",
        description: "True only if the website text block explicitly states operating hours.",
      },
      hours: {
        type: ["object", "null"],
        description:
          "Only when hours_found_on_website is true: one key per day (mon,tue,wed,thu,fri,sat,sun), each an array of [open,close] 24-hour HH:MM pairs, an empty array for a day stated as closed. Include every day the website states; omit a day it says nothing about. Null when hours_found_on_website is false.",
        additionalProperties: {
          type: "array",
          items: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
        },
      },
      current_state: {
        type: ["string", "null"],
        description:
          "One sentence naming the actual angle a rep opens the call with: what kind of business this really is and the specific context that changes how to sell it (e.g. a supplement retailer operating inside a gym, a pharmacy already carrying one line but not another), grounded only in the evidence given, meetings and calls weighted highest. Null if the evidence is too thin to say anything specific.",
      },
      future_state: {
        type: ["string", "null"],
        description:
          "One sentence naming a SPECIFIC opportunity implied directly by a gap in the evidence given (a lapsed product line, a category their site or reviews mention that they don't currently order from us). Never a generic pitch line. Null if no specific gap is evidenced.",
      },
      impact: {
        type: ["string", "null"],
        description:
          "One sentence on what closing that gap is worth, grounded in the numbers already given (revenue, order cadence) where available, otherwise tied to a concrete detail in the evidence. Null if current_state and future_state are both null.",
      },
    },
    required: ["hours_found_on_website", "hours", "current_state", "future_state", "impact"],
  },
};

type EnrichToolOutput = {
  hours_found_on_website: boolean;
  hours: Record<string, string[][]> | null;
  current_state: string | null;
  future_state: string | null;
  impact: string | null;
};

/** Strips a fetched page down to plain text, bounded so one slow/heavy site
 *  can't blow the 30-second budget or the prompt. A blocked or slow fetch
 *  degrades to "no website evidence", never a retry loop. */
async function fetchWebsiteText(rawUrl: string): Promise<string | null> {
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

/** What actually moved: total revenue, last order date, and the products that
 *  make it up, ranked by lifetime revenue. Same fields nutribiotic-account-
 *  analyst reads off nb_orders/nb_order_lines, just a plain-text digest
 *  instead of a full brief. */
function buildPurchaseDigest(orders: PurchaseOrder[], lines: PurchaseLine[]): string {
  if (orders.length === 0) return "Purchase history: no orders on file.";
  const totalRevenue = orders.reduce((sum, o) => sum + o.revenue_cents, 0) / 100;
  const lastOrder = orders[0];
  const byProduct = new Map<string, { qty: number; revenue: number }>();
  for (const line of lines) {
    if (!line.product_name) continue;
    const cur = byProduct.get(line.product_name) ?? { qty: 0, revenue: 0 };
    cur.qty += line.qty ?? 0;
    cur.revenue += line.line_revenue_cents / 100;
    byProduct.set(line.product_name, cur);
  }
  const topProducts = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
  const productText = topProducts.map(([name, v]) => `${name} ($${v.revenue.toFixed(0)} lifetime)`).join("; ");
  return (
    `Purchase history: ${orders.length} orders on file, $${totalRevenue.toFixed(0)} lifetime revenue, ` +
    // Human dates in, human dates out (Juan, 2026-09-16): the model echoes
    // whatever date shape it's shown straight into current_state/future_state
    // ("...most recently on 2026-02-16."), so a raw ISO string here is a raw
    // ISO string baked into the stored summary forever.
    `last order ${exactDate(lastOrder.ordered_at.slice(0, 10))}. Products bought: ${productText || "none itemized"}.`
  );
}

/** What Juan actually heard, most recent first, ground truth about the
 *  account (Juan, 2026-09-15: "use the info from the meetings as highest
 *  quality info to build the executive summaries"). Real engagements only,
 *  same origin/kind filter sdr-actions.ts's panel applies, so a geocode
 *  system note or an email never gets read as if it were a conversation. */
function buildMeetingDigest(activities: Activity[]): string {
  const real = activities.filter((act) => act.origin !== "enriched" && (act.kind === "call" || act.kind === "meeting"));
  if (real.length === 0) return "Meetings and calls on file: none yet.";
  const lines = real
    .slice(0, 8)
    .map((act) => `${act.kind} ${exactDate(act.at.slice(0, 10))}: ${act.detail ?? "no detail logged"}`);
  return `Meetings and calls on file, HIGHEST QUALITY SOURCE (real, said by the account, not a scrape):\n${lines.join("\n")}`;
}

const EMPTY_RESULT: Omit<QuickEnrichResult, "ok" | "error"> = {
  businessHours: null,
  hoursSource: null,
  currentState: null,
  futureState: null,
  impact: null,
  wroteHours: false,
  wroteSummary: false,
};

export async function enrichAccountQuickly(accountId: string): Promise<QuickEnrichResult> {
  const [accRes, purchases, activitiesRes] = await Promise.all([
    getAccount(accountId),
    listPurchases(accountId),
    listActivities(accountId, 30),
  ]);
  const account = accRes.data[0];
  if (!account) return { ok: false, error: "Account not found.", ...EMPTY_RESULT };

  const near = account.lat != null && account.lng != null ? { lat: account.lat, lng: account.lng } : undefined;
  const placeQuery = `${account.name}, ${[account.street, account.city, account.state].filter(Boolean).join(", ")}`;

  const [placesSettled, websiteSettled] = await Promise.allSettled([
    searchPlaces(placeQuery, 1, near),
    account.website ? fetchWebsiteText(account.website) : Promise.resolve(null),
  ]);

  const place: PlaceCandidate | null =
    placesSettled.status === "fulfilled" ? (placesSettled.value[0] ?? null) : null;
  const siteText: string | null = websiteSettled.status === "fulfilled" ? websiteSettled.value : null;

  if (!client) {
    const placesHours = place?.businessHours ?? null;
    return {
      ok: false,
      error: "ANTHROPIC_API_KEY is not configured on this deployment.",
      ...EMPTY_RESULT,
      businessHours: placesHours,
      hoursSource: placesHours ? "places" : null,
    };
  }

  const evidence = [
    `Account: ${account.name} (${account.channel}, ${account.lifecycle}), ${[account.city, account.state].filter(Boolean).join(", ") || "city unknown"}.`,
    buildMeetingDigest(activitiesRes.data),
    buildPurchaseDigest(purchases.orders, purchases.lines),
    place
      ? `Google Places match: status=${place.businessStatus ?? "unknown"}, hours on file at Places=${place.businessHours ? JSON.stringify(place.businessHours) : "none"}.`
      : "Google Places: no confident match found.",
    siteText
      ? `Website text (${account.website}):\n${siteText}`
      : account.website
        ? `Website is on file (${account.website}) but could not be read just now (fetch failed or blocked).`
        : "No website on file.",
    account.current_state || account.future_state || account.impact
      ? `An executive summary already exists on file (context only, do not repeat it): current="${account.current_state ?? ""}", future="${account.future_state ?? ""}", impact="${account.impact ?? ""}".`
      : "No executive summary on file yet.",
  ].join("\n\n");

  let toolOut: EnrichToolOutput | null = null;
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 700,
      system:
        "You are doing a 30-second field-rep lookup on one account right before a call, using ONLY the evidence blocks in the " +
        "user message. Never invent a fact, hour, product, or opportunity that is not present in that evidence. Extract hours " +
        "only if the website text states them explicitly; Google Places' own hours are applied separately and are not yours to " +
        "restate. The meetings-and-calls block is the highest-quality evidence given, real words from the account, not a scrape: " +
        "when it conflicts with the website or Places, believe the meetings block. The gap summary (current_state/future_state/" +
        "impact) must each name something concrete drawn from the evidence (an actual product, an actual lapsed order, an actual " +
        "website, Places, or meeting detail), never a generic sales line. current_state should read as a real angle a rep can " +
        "open with, naming what kind of business this actually is and where it sits (e.g. 'a nutrition specialty shop inside a " +
        "gym' or 'a pharmacy that already carries the vitamin line but not GSE'), not a bare fact restated. If the evidence does " +
        "not support a specific, honest claim, return null for that field rather than write something plausible-sounding. " +
        "If you name a date in any field, write it the way a rep would say it out loud (e.g. 'Feb 16, 2026'), never as " +
        "digits-and-dashes (never '2026-02-16').",
      messages: [{ role: "user", content: evidence }],
      tools: [ENRICH_TOOL],
      tool_choice: { type: "tool", name: "quick_enrich_account" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") toolOut = toolUse.input as EnrichToolOutput;
  } catch (err) {
    const placesHours = place?.businessHours ?? null;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Enrichment failed.",
      ...EMPTY_RESULT,
      businessHours: placesHours,
      hoursSource: placesHours ? "places" : null,
    };
  }

  const websiteHours = toolOut?.hours_found_on_website ? toolOut.hours : null;
  const businessHours = websiteHours ?? place?.businessHours ?? null;
  const hoursSource: "website" | "places" | null = websiteHours ? "website" : place?.businessHours ? "places" : null;

  const report = await applyQuickEnrichment(accountId, {
    business_hours: businessHours,
    hours_source_tier: hoursSource,
    hours_found_by:
      hoursSource === "website"
        ? `sdr_quick_enrich: ${account.website}`
        : hoursSource === "places"
          ? "sdr_quick_enrich: google_places"
          : null,
    current_state: toolOut?.current_state ?? null,
    future_state: toolOut?.future_state ?? null,
    impact: toolOut?.impact ?? null,
    gap_summary_found_by: "sdr_quick_enrich: website + google_places + purchase history",
  });

  return {
    ok: true,
    businessHours,
    hoursSource,
    currentState: report.gap_summary ? (toolOut?.current_state ?? null) : account.current_state,
    futureState: report.gap_summary ? (toolOut?.future_state ?? null) : account.future_state,
    impact: report.gap_summary ? (toolOut?.impact ?? null) : account.impact,
    wroteHours: report.business_hours?.status === "filled" || report.business_hours?.status === "updated",
    wroteSummary: report.gap_summary?.status === "filled",
    skippedReason:
      report.business_hours?.status === "skipped_stronger_tier"
        ? "Hours already on file came from a stronger source (a logged call or the website), so the Places reading was not used."
        : undefined,
  };
}
