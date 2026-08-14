/**
 * The route, as one JSON snapshot a home-screen widget can render.
 *
 * WHY AN ENDPOINT AND NOT A SCRAPE. A widget has no cookie jar and no DOM, so
 * the only honest way to put today's route on the Lock Screen is a small,
 * purpose-shaped payload the widget draws itself. This returns exactly what
 * RoutePanel shows and nothing more: the same stops, the same order, the same
 * trading facts, the same straight-line legs.
 *
 * IT IS A MIRROR, NOT A SECOND SOURCE. The order is Juan's hand-built draft
 * (nb_ui_prefs.route_draft, migration 0029) resolved against the same
 * listOwnerAccounts() the map uses, so an account that closes or leaves his
 * book drops out of the widget the same turn it drops off the map. Nothing here
 * recomputes, reorders, or optimizes anything.
 *
 * NO DRIVE TIME, NO ETA. Same rule as the panel: there is no Directions call
 * behind this, so the one number per leg is the straight-line hop, labelled as
 * such in the payload's own field name.
 *
 * Bearer-gated on NB_WIDGET_TOKEN, its OWN secret rather than the
 * NB_SESSION_SECRET the Mac bridges use. That secret signs the session cookie,
 * so a copy of it sitting in a script on a phone would be a session-minting
 * key left in a pocket. This one grants exactly one read and can be rotated in
 * Vercel without logging Juan out of anything. Sent as a header, never a query
 * string, so it stays out of URLs and access logs.
 */
import { getRouteDraft, listOwnerAccounts, type CustomStop, type MapAccount } from "../../lib/dal";
import { hasValidSession, hasWidgetToken } from "../../lib/session";
import { HUBSPOT_COMPANY_URL } from "../../lib/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://juanarenas.bio";

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Stop = {
  n: number;
  id: string;
  type: "account" | "custom";
  kind: CustomStop["kind"] | null;
  name: string;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  tier: MapAccount["tier"];
  phone: string | null;
  website: string | null;
  hubspot_url: string | null;
  last_order_at: string | null;
  trailing_12m_revenue: number | null;
  lifetime_revenue: number | null;
  top_category_12m: string | null;
  top_category_lifetime: string | null;
  /** Straight-line miles from the previous stop. Null on the first. */
  straight_line_miles_from_prev: number | null;
  maps_url: string;
  account_url: string | null;
};

export async function GET() {
  if (!(await hasWidgetToken()) && !(await hasValidSession())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const [draft, accounts] = await Promise.all([getRouteDraft(), listOwnerAccounts()]);
  const byId = new Map(accounts.data.map((a) => [a.id, a]));

  const stops: Stop[] = [];
  for (const e of draft) {
    if (typeof e !== "string") {
      stops.push({
        n: stops.length + 1,
        id: e.id,
        type: "custom",
        kind: e.kind,
        name: e.label,
        address: e.address,
        city: null,
        lat: e.lat,
        lng: e.lng,
        tier: null,
        phone: null,
        website: null,
        hubspot_url: null,
        last_order_at: null,
        trailing_12m_revenue: null,
        lifetime_revenue: null,
        top_category_12m: null,
        top_category_lifetime: null,
        straight_line_miles_from_prev: null,
        maps_url: `https://maps.apple.com/?daddr=${e.lat},${e.lng}`,
        account_url: null,
      });
      continue;
    }
    const a = byId.get(e);
    if (!a) continue; // the tombstone case, same as the map's
    stops.push({
      n: stops.length + 1,
      id: a.id,
      type: "account",
      kind: null,
      name: a.name,
      address: a.street,
      city: a.city,
      lat: a.lat,
      lng: a.lng,
      tier: a.tier,
      phone: a.phone,
      website: a.website,
      hubspot_url: a.hubspot_company_id ? HUBSPOT_COMPANY_URL(a.hubspot_company_id) : null,
      last_order_at: a.last_order_at,
      trailing_12m_revenue: a.trailing_12m_revenue,
      lifetime_revenue: a.lifetime_revenue,
      top_category_12m: a.top_category_12m,
      top_category_lifetime: a.top_category_lifetime,
      straight_line_miles_from_prev: null,
      maps_url: `https://maps.apple.com/?daddr=${a.lat},${a.lng}`,
      account_url: `${SITE}/nutribiotic/account/${a.id}`,
    });
  }

  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const miles = haversineMiles(stops[i - 1], stops[i]);
    stops[i].straight_line_miles_from_prev = Number(miles.toFixed(1));
    total += miles;
  }

  return Response.json(
    {
      ok: true,
      generated_at: new Date().toISOString(),
      count: stops.length,
      stops,
      total_straight_line_miles: stops.length > 1 ? Number(total.toFixed(1)) : null,
      maps_all_url:
        stops.length > 1
          ? `https://maps.apple.com/?daddr=${stops.map((s) => `${s.lat},${s.lng}`).join("+to:")}`
          : null,
      map_url: `${SITE}/nutribiotic/map`,
      visit_url: `${SITE}/nutribiotic/visit`,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
