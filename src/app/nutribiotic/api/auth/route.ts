/**
 * PIN exchange. The only endpoint that mints a session cookie.
 *
 * A Route Handler rather than a Server Action because cookies().set() needs a
 * response to attach Set-Cookie to, and because rate limiting belongs on one
 * explicit door rather than spread across actions.
 */

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  COOKIE,
  DEVICE_COOKIE,
  DEVICE_LIMIT,
  DEVICE_TTL,
  SESSION_TTL_SECONDS,
  LOCKOUT_MINUTES,
  checkPin,
  lockRemainingMs,
  mintDeviceToken,
  mintToken,
  registerFailure,
  registerSuccess,
} from "../../lib/session";
import { deviceLabel, enrollDevice, trustedDeviceId } from "../../lib/devices";

export async function POST(req: Request) {
  // Lockout first: a locked caller must not even reach the comparison, or the
  // lock is just a message rather than a control.
  const lockMs = lockRemainingMs();
  if (lockMs > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "locked",
        message: `Too many attempts. Locked for about ${Math.ceil(lockMs / 60000)} more minutes.`,
      },
      { status: 429 },
    );
  }

  if (!process.env.NB_PIN || !process.env.NB_SESSION_SECRET) {
    return NextResponse.json(
      { ok: false, error: "unconfigured", message: "NB_PIN and NB_SESSION_SECRET are not set." },
      { status: 503 },
    );
  }

  let pin = "";
  let remember = false;
  let surface = "";
  try {
    const body = (await req.json()) as { pin?: unknown; remember?: unknown; surface?: unknown };
    pin = typeof body.pin === "string" ? body.pin : "";
    remember = body.remember === true;
    /* A hint at WHICH tile this is, because the server cannot tell: three Home
       Screen web apps on one phone send byte-identical User-Agents. It only ever
       becomes a label on a list Juan reads, so it is truncated and never trusted
       for anything else. */
    surface = typeof body.surface === "string" ? body.surface.slice(0, 24) : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!checkPin(pin)) {
    const { locked, left } = registerFailure();
    return NextResponse.json(
      {
        ok: false,
        error: "bad_pin",
        message: locked
          ? `Too many attempts. Locked for ${LOCKOUT_MINUTES} minutes.`
          : "Incorrect PIN.",
        attempts_left: left,
        locked,
      },
      { status: 401 },
    );
  }

  registerSuccess();
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/nutribiotic",
  };
  jar.set(COOKIE, await mintToken(), { ...opts, maxAge: SESSION_TTL_SECONDS });

  /* REMEMBERING THIS DEVICE (2026-08-17). Possession of the PIN is what
     authorizes it, which is why this is here and nowhere else: no other code
     path may mint a device.
     Three outcomes, all reported rather than swallowed, because a checkbox that
     quietly does nothing is worse than no checkbox:
       already  the cookie already names a live device, so refresh it and stop
       ok       a slot was free
       full     the cap is reached; the PIN still signed him in, it just bought
                eight hours instead of a year. */
  let remembered: "already" | "ok" | "full" | "off" | "error" = "off";
  if (remember) {
    try {
      const existing = await trustedDeviceId();
      if (existing) {
        jar.set(DEVICE_COOKIE, await mintDeviceToken(existing), { ...opts, maxAge: DEVICE_TTL });
        remembered = "already";
      } else {
        const ua = (await headers()).get("user-agent") ?? "";
        const id = await enrollDevice(deviceLabel(ua, surface), ua, DEVICE_LIMIT);
        if (id) {
          jar.set(DEVICE_COOKIE, await mintDeviceToken(id), { ...opts, maxAge: DEVICE_TTL });
          remembered = "ok";
        } else {
          remembered = "full";
        }
      }
    } catch {
      /* The PIN was right, so the sign-in stands. Only the remembering failed,
         and saying so beats a tile that silently asks again tomorrow. */
      remembered = "error";
    }
  }

  return NextResponse.json({ ok: true, remembered, device_limit: DEVICE_LIMIT });
}

/**
 * Sign out. Clears the session AND stops trusting this device, which is the
 * only behaviour that matches what the button says: a sign-out that left a
 * year-long device cookie behind would sign him straight back in.
 *
 * The nb_devices row is NOT revoked here — this is "sign out", not "forget this
 * device forever". The row is what the devices screen revokes.
 */
export async function DELETE() {
  const jar = await cookies();
  /* The PATH is part of a cookie's identity. Both were set on /nutribiotic, so
     deleting them by bare name clears a different cookie that does not exist and
     leaves these two in place. */
  jar.delete({ name: COOKIE, path: "/nutribiotic" });
  jar.delete({ name: DEVICE_COOKIE, path: "/nutribiotic" });
  return NextResponse.json({ ok: true });
}
