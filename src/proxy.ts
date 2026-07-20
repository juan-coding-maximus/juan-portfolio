/**
 * Proxy (what Next.js called Middleware before 16).
 *
 * SCOPE: only /nutribiotic/*. The matcher below deliberately excludes every
 * other route so the public portfolio is completely untouched by this file.
 *
 * THE PIN GATE WAS REMOVED OUTRIGHT on 2026-07-20, at Juan's direction.
 * Consequence, stated plainly rather than buried: anyone with the URL can read
 * these pages, and they hold real business data on real prospects. The headers
 * below keep the surface out of search results and frames; they are not access
 * control. If a gate ever returns, build it in the DAL first (Next's own
 * guidance: Proxy runs on every matched route including prefetches, so it must
 * never be the authorization gate).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(_req: NextRequest) {
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
