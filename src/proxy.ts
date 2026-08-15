/**
 * Proxy (what Next.js called Middleware before 16).
 *
 * SCOPE: only /nutribiotic/*. The matcher below deliberately excludes every
 * other route so the public portfolio is completely untouched by this file.
 *
 * THIS IS NOT THE AUTHORIZATION GATE, and it must never become one. Next's own
 * guidance (node_modules/next/dist/docs/01-app/02-guides/authentication.md:1031)
 * is explicit: Proxy runs on every matched route including prefetches, so it may
 * only read the cookie optimistically and must never hit a database. The real
 * gate is verifySession() in the Data Access Layer, which runs at the top of
 * every single query.
 *
 * So this file does exactly one useful thing: bounce an obviously-unauthenticated
 * request to the gate before the page renders. If it were bypassed entirely, the
 * DAL would still refuse to return a single row.
 *
 * PIN gate reinstated 2026-08-10, at Juan's direction, after 18 days open
 * ("anyone with the URL can read these pages" — the prior state of this file).
 * Same shape as before: one PIN, one signed session cookie, no per-page layers.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, verifyToken } from "./app/nutribiotic/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The gate itself and every API route stay reachable while logged out: the
  // gate obviously needs to be, and the API routes either mint the session
  // (api/auth) or carry their own bearer-token gate for the Mac-only callers
  // (api/touchpoint, api/visits/*) — a redirect here would break a POST body
  // those callers send with no browser cookie at all.
  if (pathname === "/nutribiotic/gate" || pathname.startsWith("/nutribiotic/api/")) {
    return NextResponse.next();
  }

  // The home-screen icons, one per launchable screen. iOS fetches them while
  // adding a page to the Home Screen and again on later refreshes, sometimes
  // outside Safari's cookie jar; a redirect to the gate there yields a blank
  // grey tile. They are brand marks with no data behind them, so they cost
  // nothing to serve.
  //
  // THE EXTENSION IS PART OF THE PATH for a static icon and absent for a
  // generated one: apple-icon.tsx routes at /…/apple-icon, while a committed
  // apple-icon.png routes at /…/apple-icon.png. An endsWith("/apple-icon")
  // check silently 307'd both real launcher tiles to the gate.
  if (/\/apple-icon(\.[a-z0-9]+)?$/.test(pathname)) {
    return NextResponse.next();
  }

  // The buyer surface. A store owner holding a handwritten card must never
  // meet a PIN, so /nutribiotic/promo/* passes with no cookie. What keeps it
  // safe is the shape of its data access, not this file: promo-public.ts
  // reads one code by exact key and inserts orders, nothing else. Headers
  // still apply; a personalized offer page has no business being indexed.
  if (pathname.startsWith("/nutribiotic/promo")) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  const ok = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/nutribiotic/gate";
    url.search = "";
    /* CARRY WHERE HE WAS GOING (Juan, 2026-08-14). Without this the gate always
       finished on /nutribiotic, which permanent-redirects to the map, so every
       Home Screen tile became a Map tile the moment the eight-hour session
       lapsed: ExpensOS and ClientOS both opened the same screen, which is the
       one thing two separate launchers must never do.

       Only the PATH travels, never the query string: this value is echoed into
       a redirect, and the fewer attacker-shaped parts of a URL that survive a
       round trip through a login page the better. The gate re-validates it
       anyway before using it. */
    if (pathname !== "/nutribiotic") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();

  // This surface shows a third party's customer data. It has no business being
  // indexed, framed, or referred onward.
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  matcher: ["/nutribiotic/:path*"],
};
