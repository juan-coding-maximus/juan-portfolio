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
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, verifyToken } from "./app/nutribiotic/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The gate itself and its auth endpoint must stay reachable while logged out.
  if (pathname === "/nutribiotic/gate" || pathname.startsWith("/nutribiotic/api/")) {
    return NextResponse.next();
  }

  const ok = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/nutribiotic/gate";
    url.search = "";
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
