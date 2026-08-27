"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Warm the rest of the OS, but only well after the screen is usable.
 *
 * Juan, 2026-08-26: "it pre-loads more functions after 15s of connection and
 * being able to write and use the main page."
 *
 * The order below is the order he actually reaches for things from a doorway.
 * Map first, because the next stop is the next thing after filing this one.
 *
 * WHY A DELAY AND NOT NEXT'S OWN LINK PREFETCH. The nav is `<Link>`s, which
 * prefetch when they enter the viewport, i.e. immediately on this screen,
 * because the nav is always on it. Every one of those prefetches is a
 * force-dynamic render competing with the capture box for the same connection
 * on the same phone on LTE outside a store. Fifteen seconds is long after he
 * has started typing, and typing is the only thing this screen owes him.
 *
 * WHY IT WAITS FOR IDLE TOO. A timer that fires while he is mid-sentence still
 * steals bandwidth. requestIdleCallback defers to the first quiet moment after
 * the fifteen seconds; Safari has no such API, so there the timer alone is the
 * signal and the fallback simply runs on time.
 *
 * Prefetch failures are silent by construction: a warmed route is an
 * optimization, and a phone with no signal must degrade to "slow", never to
 * "broken". Nothing here writes anything or reads a customer record.
 */
const WARM_AFTER_MS = 15_000;

const ROUTES = [
  "/nutribiotic/map",
  "/nutribiotic/outbound",
  "/nutribiotic/expenses",
  "/nutribiotic/clients",
];

export function WarmRoutes() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;

    const warm = () => {
      if (cancelled) return;

      /**
       * NOT ON A BAD LINK, AND NOT ON HIS DATA IF HE SAID SO.
       *
       * Every route here is force-dynamic, so a prefetch is a full server
       * render, and /map ships the whole territory. That is a fine trade on
       * wifi and a bad one on a weak cell connection outside a store, which is
       * exactly where this screen is used. `saveData` is the user asking not
       * to spend data; 2g/slow-2g means the spend would not pay off anyway.
       * The API is Chromium-only, so this is an opportunistic check: absent
       * means proceed, never means block.
       */
      const conn = (navigator as unknown as {
        connection?: { saveData?: boolean; effectiveType?: string };
      }).connection;
      if (conn?.saveData) return;
      if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return;

      for (const href of ROUTES) {
        try {
          router.prefetch(href);
        } catch {
          // Never let a warm-up surface as an error on a capture screen.
        }
      }
    };

    const timer = setTimeout(() => {
      if (cancelled) return;
      const ric = (window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }).requestIdleCallback;
      if (ric) idleHandle = ric(warm, { timeout: 5_000 });
      else warm();
    }, WARM_AFTER_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (idleHandle !== null && cic) cic(idleHandle);
    };
  }, [router]);

  return null;
}
