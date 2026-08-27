/**
 * The hand-built route (draft, calls, done), fetched by RouteProvider itself.
 *
 * WHY THIS IS NOT A PROP ANY MORE (2026-08-27). The layout used to read this
 * and hand it to RouteProvider. First it awaited the read, which blocked every
 * NutriBiotic screen, /visit included, on data /visit never uses. Then it
 * passed the un-awaited promise instead, which looked like a fix and was not:
 * a promise handed from a server component to a client component keeps the RSC
 * stream OPEN until it resolves, so the document still could not close until
 * nb_ui_prefs answered.
 *
 * That open stream is what iOS reports as "This page couldn't load" when a
 * phone's connection saturates mid-flight, which is exactly what happened on
 * 2026-08-27 at 09:26 with every request in the log reading 200.
 *
 * So the layout now carries no data at all, and the one provider that needs
 * some goes and gets it. Read-only, same gate as every other screen.
 */
import { getRouteStateByDay, isConfigured } from "../../lib/dal";
import { isNextControlFlowError } from "../../lib/redirect-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const empty = { draft: {}, calls: {}, done: {} };
  if (!isConfigured()) {
    return Response.json({ ok: true, ...empty }, { headers: { "cache-control": "no-store" } });
  }
  try {
    const state = await getRouteStateByDay();
    return Response.json({ ok: true, ...state }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    // A lapsed session must still reach the gate.
    if (isNextControlFlowError(e)) throw e;
    // An unreadable route is an empty route that says so (RouteProvider's
    // `hydrated`), never an error the whole screen carries.
    return Response.json({ ok: false, ...empty }, { headers: { "cache-control": "no-store" } });
  }
}
