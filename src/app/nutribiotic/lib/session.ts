/**
 * PIN session for /nutribiotic.
 *
 * Single-user tool, so there is no accounts system, no roles, and no user table.
 * A PIN plus a signed cookie is the whole model, and that is a deliberate scope
 * decision rather than a shortcut: multi-tenant auth here would be a week of work
 * protecting one person from themselves.
 *
 * SECURITY NOTES, each of which is load-bearing:
 *
 *  - The cookie is SIGNED (HMAC-SHA256) so it cannot be forged client-side. It
 *    carries only an expiry, never the PIN.
 *  - PIN comparison is TIMING-SAFE. A `===` on a short PIN leaks its prefix to a
 *    patient attacker.
 *  - Failed attempts are rate-limited with a lockout. A 4-6 digit PIN on an
 *    unthrottled endpoint is brute-forceable in seconds, which would make every
 *    other measure here decorative.
 *  - Web Crypto only (no node:crypto), so this module runs unchanged in the Proxy
 *    runtime as well as in Route Handlers.
 *
 * Node's runtime env vars required (set in Vercel, never committed):
 *    NB_PIN            the PIN itself
 *    NB_SESSION_SECRET a long random string used to sign the cookie (already set,
 *                       shared with the bearer-token gate on the Mac-only write
 *                       endpoints — same secret, two different uses)
 */

import { cookies, headers } from "next/headers";

export const COOKIE = "nb_session";
const TTL_SECONDS = 60 * 60 * 8; // 8h, about one working day
const LOCK_MAX = 5;
const LOCK_MINUTES = 15;

/**
 * The remembered-device cookie (2026-08-17). Separate from the session cookie
 * on purpose, and weaker in exactly one way and stronger in another:
 *
 *  - It carries a DEVICE ID, not just an expiry, so what it proves can be looked
 *    up and taken away. A signed-expiry-only cookie that lasted a year would be
 *    revocable only by rotating NB_SESSION_SECRET, which also logs out the Mac
 *    bridges.
 *  - Its signature is checked here, but a device is only TRUSTED once devices.ts
 *    confirms the row is still live. This module stays database-free so proxy.ts
 *    can keep importing it (Proxy may never touch a database — see proxy.ts).
 *
 * 400 days is the ceiling browsers now clamp a persistent cookie to, so asking
 * for more just gets silently trimmed.
 */
export const DEVICE_COOKIE = "nb_device";
const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 400;

/**
 * How many devices may ever be remembered. Six, not the three Juan named, and
 * the difference is iOS rather than generosity: every Home Screen web app has
 * its own cookie jar, so the OS tile, ClientOS and ExpensOS on one phone are
 * three devices to this table before the work phone or the laptop is counted.
 * Overridable with NB_DEVICE_LIMIT without a deploy.
 */
export const DEVICE_LIMIT = Math.max(1, Number(process.env.NB_DEVICE_LIMIT) || 6);

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const secret = process.env.NB_SESSION_SECRET;
  if (!secret) throw new Error("NB_SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

/** Constant-time string compare. Never replace this with ===. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function mintToken(): Promise<string> {
  const exp = Date.now() + TTL_SECONDS * 1000;
  const payload = String(exp);
  return `${payload}.${await hmac(payload)}`;
}

/**
 * Verify a token's signature and expiry.
 *
 * Pure and dependency-free on purpose, so Proxy can call it for the optimistic
 * check without importing anything that touches a database.
 */
export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx < 1) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);

  let expected: string;
  try {
    expected = await hmac(payload);
  } catch {
    return false;
  }
  if (!timingSafeEqual(sig, expected)) return false;

  const exp = Number(payload);
  return Number.isFinite(exp) && Date.now() < exp;
}

/**
 * Mint a remembered-device token. Signs `<deviceId>.<expiry>` so neither half
 * can be edited: an attacker who could rewrite the id would walk into any live
 * device's slot, and one who could rewrite the expiry would hold it forever.
 */
export async function mintDeviceToken(deviceId: string): Promise<string> {
  const payload = `${deviceId}.${Date.now() + DEVICE_TTL_SECONDS * 1000}`;
  return `${payload}.${await hmac(payload)}`;
}

/** The device id a well-signed, unexpired token claims, or null. Says nothing
 *  about whether that device is still trusted; see devices.ts. */
export async function readDeviceToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const sigAt = token.lastIndexOf(".");
  if (sigAt < 1) return null;
  const payload = token.slice(0, sigAt);
  const sig = token.slice(sigAt + 1);

  let expected: string;
  try {
    expected = await hmac(payload);
  } catch {
    return null;
  }
  if (!timingSafeEqual(sig, expected)) return null;

  const expAt = payload.lastIndexOf(".");
  if (expAt < 1) return null;
  const exp = Number(payload.slice(expAt + 1));
  if (!Number.isFinite(exp) || Date.now() >= exp) return null;
  return payload.slice(0, expAt);
}

/** The device id claimed by this request's cookie, signature-checked only. */
export async function claimedDeviceId(): Promise<string | null> {
  const jar = await cookies();
  return readDeviceToken(jar.get(DEVICE_COOKIE)?.value);
}

/**
 * The one gate the DAL calls, recognizing either proof of authorization:
 *
 *  - a valid signed session cookie (the browser, after the PIN gate), or
 *  - the Authorization: Bearer <NB_SESSION_SECRET> header (the Mac-side
 *    bridges — bridges/nutribiotic/cliente.py and visits.py — which call
 *    recordTouchpoint()/patchVisitRecording() through their own route
 *    handlers, server-to-server, and never hold a browser cookie).
 *
 * Both are equally strong proofs: a signed cookie minted from the PIN, or
 * possession of the same secret that signs it. Route handlers that accept the
 * bearer form (api/touchpoint, api/visits/transcript) additionally check it
 * themselves up front for a clean 401, but the DAL must accept it too, or
 * every write those routes make would otherwise redirect to the gate.
 */
export async function hasValidSession(): Promise<boolean> {
  const hdrs = await headers();
  const auth = hdrs.get("authorization") ?? "";
  const secret = process.env.NB_SESSION_SECRET;
  if (secret && timingSafeEqual(auth, `Bearer ${secret}`)) return true;

  const jar = await cookies(); // async in Next 16
  return verifyToken(jar.get(COOKIE)?.value);
}

/**
 * The home-screen widget's own proof (NB_WIDGET_TOKEN), and a READ-ONLY one.
 *
 * A widget on a phone cannot hold a cookie, so it has to carry a secret. It
 * deliberately does not carry THIS module's secret: NB_SESSION_SECRET signs the
 * session cookie and unlocks the Mac bridges' write endpoints, so a copy of it
 * in a Scriptable script would be a session-minting key living in a pocket,
 * revocable only by logging Juan out of everything.
 *
 * So this is a second, separate bearer, recognized by dal.ts on READS ONLY
 * (query(), never mutate()). Worst case if it leaks: someone learns which
 * stores Juan planned to visit, and the token is rotated in Vercel with no
 * other consequence.
 */
export async function hasWidgetToken(): Promise<boolean> {
  const token = process.env.NB_WIDGET_TOKEN;
  if (!token) return false;
  const hdrs = await headers();
  return timingSafeEqual(hdrs.get("authorization") ?? "", `Bearer ${token}`);
}

/**
 * Lockout state.
 *
 * In-memory, which is the honest choice for a single-user tool on serverless:
 * it resets on cold start, so it is a speed bump rather than a vault. It raises
 * the cost of online brute force by orders of magnitude, which is all it claims
 * to do. If this ever needs to be authoritative, move it to a Supabase row like
 * the finance-data edge function's finance_auth table.
 */
type Attempts = { count: number; lockedUntil: number };
const attempts: Attempts = { count: 0, lockedUntil: 0 };

export function lockRemainingMs(): number {
  return Math.max(0, attempts.lockedUntil - Date.now());
}

export function registerFailure(): { locked: boolean; left: number } {
  attempts.count += 1;
  if (attempts.count >= LOCK_MAX) {
    attempts.lockedUntil = Date.now() + LOCK_MINUTES * 60_000;
    attempts.count = 0;
    return { locked: true, left: 0 };
  }
  return { locked: false, left: LOCK_MAX - attempts.count };
}

export function registerSuccess(): void {
  attempts.count = 0;
  attempts.lockedUntil = 0;
}

export function checkPin(candidate: string): boolean {
  const real = process.env.NB_PIN;
  if (!real) return false;
  return timingSafeEqual(candidate, real);
}

export const SESSION_TTL_SECONDS = TTL_SECONDS;
export const DEVICE_TTL = DEVICE_TTL_SECONDS;
export const LOCKOUT_MINUTES = LOCK_MINUTES;
