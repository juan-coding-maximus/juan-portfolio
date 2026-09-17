/**
 * "Search our book": a second, always-visible search bar above the area
 * picker on the Search screen (Juan, 2026-09-16), for finding an account he
 * already has rather than sweeping for a new one.
 *
 * READ-ONLY, and it reads the same account list recordTouchpoint()'s account
 * matcher uses (listAccountsForMatching(): owned, not closed, not a waypoint,
 * WITHOUT the chain/practice-excluded display filter listAccounts() applies),
 * because "our book" means every real account Juan calls on, not the trimmed
 * work-queue view.
 *
 * THE WHOLE LIST COMES BACK ONCE, not filtered server-side per keystroke.
 * Same idiom as map/ClientSearchField.tsx: the client already has Juan's book
 * loaded and searches it in memory as he types, which is both instant and one
 * request instead of one per keystroke. Cached 60 seconds in memory here too,
 * since this org has already been suspended once for egress (2026-09-02) and
 * a reload of the Search screen should not mean a fresh full-book read.
 */
import { hasAccess } from "../../../lib/devices";
import { listAccountsForMatching, type TierRow } from "../../../lib/dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;

let cache: { at: number; rows: TierRow[] } | null = null;

export async function GET() {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    if (!cache || Date.now() - cache.at >= CACHE_MS) {
      const res = await listAccountsForMatching();
      cache = { at: Date.now(), rows: res.data ?? [] };
    }
  } catch (e) {
    return Response.json(
      { ok: false, error: "Could not read the book.", detail: String(e).slice(-400) },
      { status: 502 },
    );
  }

  const results = cache.rows.map((row) => ({
    id: row.account_id,
    name: row.name,
    area: row.area,
    tier: row.tier,
  }));

  return Response.json(
    { ok: true, results },
    { headers: { "cache-control": "private, max-age=30" } },
  );
}
