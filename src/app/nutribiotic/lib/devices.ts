/**
 * Remembered devices: the registry behind "stop asking me for the PIN on my own
 * phone".
 *
 * WHY THIS IS ITS OWN MODULE AND NOT PART OF dal.ts. The DAL's gate calls this
 * to decide whether a request is authorized, so if this lived in the DAL it
 * would be a cycle: every query would ask the gate, which would ask a query.
 * So this file talks to Supabase directly. That is the ONE exception to the
 * DAL's "only place this app touches Supabase" rule, it is deliberate, and it is
 * kept honest by scope: three statements, one table, no domain data, ever.
 *
 * WHY NOT AN IP ALLOWLIST, which is what was asked for. Juan's phone changes IP
 * every time it moves between towers and shares its egress address with every
 * other customer on that carrier, so an allowlist would lock him out on the 405
 * and admit strangers from the same tower. Binding to the BROWSER instead, with
 * a signed long-lived cookie, is both stronger and the one that actually stops
 * asking.
 *
 * THE THREE PROPERTIES THAT MAKE IT SAFE ENOUGH TO SKIP A PIN:
 *  1. The cookie is HMAC-signed with NB_SESSION_SECRET and unforgeable, HttpOnly
 *     so no script can read it, and scoped to /nutribiotic.
 *  2. Trust is CAPPED (session.ts, DEVICE_LIMIT). Once the slots are full the
 *     PIN still signs you in but never mints another remembered device, so a PIN
 *     seen over a shoulder next spring buys eight hours, not a year.
 *  3. Trust is REVOCABLE per device from /nutribiotic/devices, and revocation is
 *     enforced here, on every request, by the same gate that guards the data.
 *     proxy.ts only checks the signature, because Proxy may never touch a
 *     database; a revoked device gets past Proxy and straight into the gate.
 */

import "server-only";
import { cache } from "react";
import { claimedDeviceId, hasValidSession } from "./session";

const SB_URL = process.env.NB_SUPABASE_URL ?? "";
const SB_KEY = process.env.NB_SUPABASE_SERVICE_ROLE_KEY ?? "";

export type Device = {
  id: string;
  label: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

const configured = (): boolean => Boolean(SB_URL && SB_KEY);

async function sb(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/nb_devices${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** 'dev_<6 hex>', the schema's id shape. Meaningless by design: the cookie
 *  should name a row, not describe the person holding the phone. */
function newDeviceId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `dev_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The device this request is trusted as, or null.
 *
 * `cache()` for the same reason verifySession uses it: one render pass asks the
 * gate many times and this must not be many round trips. A signature that
 * checks out but names a revoked or missing row returns null, which is the
 * whole point of keeping a row at all.
 */
export const trustedDeviceId = cache(async (): Promise<string | null> => {
  const claimed = await claimedDeviceId();
  if (!claimed || !configured()) return null;

  const params = new URLSearchParams({
    select: "id,last_seen_at",
    id: `eq.${claimed}`,
    revoked_at: "is.null",
    limit: "1",
  });

  let rows: { id: string; last_seen_at: string | null }[];
  try {
    const res = await sb(`?${params}`);
    if (!res.ok) return null;
    rows = (await res.json()) as typeof rows;
  } catch {
    // Fail CLOSED. A device that cannot be confirmed live is not trusted; the
    // PIN gate is the fallback, which is an inconvenience rather than a hole.
    return null;
  }
  if (rows.length === 0) return null;

  // NOT AWAITED. This is a cosmetic timestamp for the devices list, and it sat
  // on the critical path of every page load that authenticated by device
  // rather than by session: a blocking PATCH between the tap on ClientOS and
  // the capture box existing. Fired and forgotten, with its own catch so an
  // unhandled rejection can never take down the request that started it.
  void touch(rows[0].id, rows[0].last_seen_at).catch(() => {});
  return rows[0].id;
});

/** Stamp last-seen, but only once every six hours: this runs on requests, and a
 *  write per page view would turn a read gate into a write gate. The column is
 *  for Juan's eyes on the devices list, so six-hour resolution is plenty. */
async function touch(id: string, lastSeen: string | null): Promise<void> {
  const stale = !lastSeen || Date.now() - Date.parse(lastSeen) > 6 * 60 * 60 * 1000;
  if (!stale) return;
  try {
    await sb(`?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
    });
  } catch {
    // A missed timestamp is cosmetic. It must never fail a request.
  }
}

/**
 * The gate everything now asks: a valid PIN session, OR a remembered device.
 * Replaces the direct hasValidSession() calls at the top of the DAL and in the
 * layout. The Mac bridges' bearer token is still recognized inside
 * hasValidSession, untouched.
 */
export const hasAccess = cache(async (): Promise<boolean> => {
  if (await hasValidSession()) return true;
  return (await trustedDeviceId()) !== null;
});

/** null means the registry could not be read, which is NOT the same fact as an
 *  empty registry: one says "no device is remembered", the other says "I cannot
 *  tell you". The screen says whichever is true. */
export async function listDevices(): Promise<Device[] | null> {
  if (!configured()) return null;
  const params = new URLSearchParams({
    select: "id,label,user_agent,created_at,last_seen_at,revoked_at",
    order: "created_at.desc",
    limit: "50",
  });
  try {
    const res = await sb(`?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as Device[];
  } catch {
    return null;
  }
}

export async function liveDeviceCount(): Promise<number> {
  if (!configured()) return 0;
  const res = await sb(`?select=id&revoked_at=is.null`);
  if (!res.ok) return 0;
  return ((await res.json()) as unknown[]).length;
}

/**
 * Enrol this browser, if there is a slot. Called only from the PIN endpoint,
 * after the PIN has been checked: possession of the PIN is what authorizes a
 * device to be remembered, and nothing else may mint one.
 *
 * Returns the new id, or null when the cap is full, which the gate reports
 * rather than swallowing. Silently not remembering a device Juan asked it to
 * remember would train him to distrust the checkbox.
 */
export async function enrollDevice(label: string, userAgent: string, limit: number): Promise<string | null> {
  /* Throws rather than returning null when there is no backend, because null
     here MEANS "the cap is full" and the gate says so on screen. Reporting a
     full registry to someone whose registry cannot be reached at all would send
     him to a devices page to free a slot that was never taken. */
  if (!configured()) throw new Error("Cannot remember a device: no data source configured.");
  if ((await liveDeviceCount()) >= limit) return null;

  const id = newDeviceId();
  const res = await sb("", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      // Both are UA-derived, so both are attacker-shaped strings. They are
      // rendered as text by React and decide nothing; the length caps are so a
      // hostile UA cannot make the devices list unreadable.
      label: label.slice(0, 60),
      user_agent: userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`nb_devices insert -> HTTP ${res.status}`);
  return id;
}

export async function revokeDevice(id: string): Promise<void> {
  if (!configured()) throw new Error("No data source configured.");
  const res = await sb(`?id=eq.${encodeURIComponent(id)}&revoked_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`nb_devices revoke -> HTTP ${res.status}`);
}

/**
 * A readable name for a browser, from its User-Agent and one hint the gate
 * sends about which Home Screen tile it is (which the server cannot see: three
 * tiles on one phone send byte-identical User-Agents).
 *
 * Best-effort and labelled as such in the UI. It names a row Juan is about to
 * revoke; it authorizes nothing.
 */
export function deviceLabel(userAgent: string, surface?: string): string {
  const ua = userAgent || "";
  const hardware = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
      ? "iPad"
      : /Macintosh|Mac OS X/i.test(ua)
        ? "Mac"
        : /Android/i.test(ua)
          ? "Android"
          : /Windows/i.test(ua)
            ? "Windows PC"
            : "Unknown device";
  const where = (surface || "").trim().slice(0, 24);
  return where ? `${hardware} · ${where}` : hardware;
}
