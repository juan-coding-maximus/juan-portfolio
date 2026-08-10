/**
 * The PUBLIC door onto the promo tables, and the only one.
 *
 * dal.ts declares itself the only place this app touches Supabase, and for the
 * gated OS that stays true. This module is the one deliberate exception, and
 * it exists because the buyer surface (/nutribiotic/promo) is reachable with
 * no PIN by design: a store owner holding a handwritten card must never meet
 * a login. verifySession() would bounce every one of them to the gate.
 *
 * What keeps a sessionless door from being a hole:
 *   - READS are exact-key only: one code, by normalized primary key. There is
 *     no list, no search, no enumeration endpoint. Guessing is defeated by the
 *     random code suffix, not by obscurity of the route.
 *   - WRITES are two: insert one order, and advance a code's own state machine
 *     (issued->viewed, ->requested, lazy ->expired). No update touches another
 *     table, no delete exists.
 *   - RATE LIMIT is in-memory per IP, same honest speed-bump status as the
 *     PIN lockout in session.ts: it resets on cold start and claims no more.
 *   - The service-role key never leaves the server; these functions are
 *     "server-only" and the pages render on the server.
 */

import "server-only";

const SB_URL = process.env.NB_SUPABASE_URL ?? "";
const SB_KEY = process.env.NB_SUPABASE_SERVICE_ROLE_KEY ?? "";

import { normalizeCode, type PromoCode, type PromoOrder, type PromoTemplate } from "./promo";

export const promoConfigured = (): boolean => Boolean(SB_URL && SB_KEY);

const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...HEADERS, Prefer: "return=representation", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`promo ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Exact-key lookup. Anything else about a code is not this surface's business. */
export async function getCode(raw: string): Promise<PromoCode | null> {
  if (!promoConfigured()) return null;
  const norm = normalizeCode(raw);
  if (!norm || norm.length > 24) return null;
  const rows = await rest<PromoCode[]>(`nb_promo_codes?code_norm=eq.${encodeURIComponent(norm)}&limit=1`);
  const code = rows[0] ?? null;
  if (!code) return null;

  // Lazy expiry: stored state says issued/viewed but the clock has passed.
  // The page treats it as expired either way; the PATCH just makes the rep
  // list agree with what the buyer saw.
  if ((code.state === "issued" || code.state === "viewed") && new Date(code.expires_at) < new Date()) {
    code.state = "expired";
    void rest(`nb_promo_codes?code_norm=eq.${encodeURIComponent(norm)}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "expired" }),
    }).catch(() => {});
  }
  return code;
}

/** issued -> viewed, first time a buyer opens the page. Fire-and-forget. */
export async function markViewed(code_norm: string): Promise<void> {
  if (!promoConfigured()) return;
  await rest(`nb_promo_codes?code_norm=eq.${encodeURIComponent(code_norm)}&state=eq.issued`, {
    method: "PATCH",
    body: JSON.stringify({ state: "viewed", first_viewed_at: new Date().toISOString() }),
  }).catch(() => {});
}

/**
 * The order write sequence, in the order that matters: the row first, the code
 * state second. The database is the record; anything downstream (Juan's relay
 * to the orders team) reads from it.
 */
export async function createOrder(
  order: Omit<PromoOrder, "id" | "state" | "created_at" | "relayed_at">,
): Promise<PromoOrder> {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const id = `pord_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;

  const rows = await rest<PromoOrder[]>("nb_promo_orders", {
    method: "POST",
    body: JSON.stringify({ ...order, id }),
  });

  await rest(`nb_promo_codes?code_norm=eq.${encodeURIComponent(order.code_norm)}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "requested", requested_at: new Date().toISOString() }),
  });

  return rows[0];
}

/** Latest order for a code, for the /received summary. Exact-key again. */
export async function latestOrder(code_norm: string): Promise<PromoOrder | null> {
  if (!promoConfigured()) return null;
  const rows = await rest<PromoOrder[]>(
    `nb_promo_orders?code_norm=eq.${encodeURIComponent(code_norm)}&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

/**
 * The general fallback offer: the active template flagged is_general, rendered
 * when a code is mistyped, expired, or void. If none has been published there
 * is NO invented "25% off" consolation; the page shows Juan's contact and
 * nothing else, which is the honest floor.
 */
export async function generalTemplate(): Promise<PromoTemplate | null> {
  if (!promoConfigured()) return null;
  const rows = await rest<PromoTemplate[]>(
    `nb_promo_templates?is_general=eq.true&active=eq.true&order=updated_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Rate limiting: 10 lookups / 5 requests per minute per IP. In-memory, honest
// about being a speed bump (see session.ts lockout for the same reasoning).
// ---------------------------------------------------------------------------
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, bucket: string, max: number): boolean {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (list.length >= max) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  // Keep the map from growing unboundedly on a long-lived instance.
  if (hits.size > 5000) hits.clear();
  return false;
}
