/**
 * One location report from the widget's "tap to update" button (migration
 * 0044, Juan's ask 2026-08-27). MapScreen.tsx reports its own geolocation
 * fixes through a server action instead (reportLiveLocation, prefs-actions.ts,
 * same underlying dal.ts write) since a browser page can call a server
 * action directly; the widget can't, so it needs this HTTP door.
 *
 * AUTH WIDENED THE SAME WAY api/widget/mileage/route.ts IS: the widget's
 * read-only NB_WIDGET_TOKEN is allowed to make this one write. A coordinate
 * is the same low-stakes class as Juan's own odometer photo -- his own
 * position, never a customer record, never HubSpot. See dal.ts's
 * setLastLocationAndAutoComplete, which enforces this same check again.
 */
import { setLastLocationAndAutoComplete } from "../../lib/dal";
import { hasAccess } from "../../lib/devices";
import { hasWidgetToken } from "../../lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await hasWidgetToken()) && !(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const { lat, lng } = (body ?? {}) as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ ok: false, error: "lat and lng must be numbers." }, { status: 400 });
  }

  try {
    const result = await setLastLocationAndAutoComplete(lat, lng);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Failed to save location." }, { status: 500 });
  }
}
