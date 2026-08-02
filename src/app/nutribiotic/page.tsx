/**
 * Root. Today retired in favor of Plan as the home screen (2026-08-02): Plan
 * now carries the daily capture and work queues Today used to hold, plus the
 * itinerary. This route survives only so old links and muscle memory land
 * somewhere true.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  permanentRedirect("/nutribiotic/plan");
}
