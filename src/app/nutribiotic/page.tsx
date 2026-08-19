/**
 * Root. Plan (the static month itinerary plus the daily-capture widgets it had
 * accumulated) retired 2026-08-12; Map was home from then until 2026-08-19,
 * when Juan moved home to Visit/ClientOS, the screen he opens first now to
 * file whatever just happened before anything else. This route survives only
 * so old links and muscle memory land somewhere true.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  permanentRedirect("/nutribiotic/visit");
}
