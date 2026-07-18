/**
 * PIN exchange. The only endpoint that mints a session cookie.
 *
 * A Route Handler rather than a Server Action because cookies().set() needs a
 * response to attach Set-Cookie to, and because rate limiting belongs on one
 * explicit door rather than spread across actions.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE,
  SESSION_TTL_SECONDS,
  LOCKOUT_MINUTES,
  checkPin,
  lockRemainingMs,
  mintToken,
  registerFailure,
  registerSuccess,
} from "../../lib/session";

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
  try {
    const body = (await req.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin : "";
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
  jar.set(COOKIE, await mintToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/nutribiotic",
    maxAge: SESSION_TTL_SECONDS,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(COOKIE);
  return NextResponse.json({ ok: true });
}
