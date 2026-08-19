"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * As a Home Screen tile, iOS often suspends the page instead of unloading it:
 * switching apps and back shows the exact DOM from before backgrounding, with
 * no navigation event for Next's router cache to key off. That's the "Visit
 * stays stuck until I reload" symptom, distinct from the prefetch-caching fix
 * in each route's loading.tsx (which only covers in-app Link navigation).
 * `pageshow`'s `persisted` flag fires on that exact bfcache-style restore;
 * `visibilitychange` covers the same return-to-foreground case in the browser
 * tab. Both just ask the server for this screen's current data again.
 */
export function RefreshOnForeground() {
  const router = useRouter();

  useEffect(() => {
    function onShow(e: PageTransitionEvent) {
      if (e.persisted) router.refresh();
    }
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
