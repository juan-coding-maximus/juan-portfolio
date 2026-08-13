/**
 * Root. Plan (the static month itinerary plus the daily-capture widgets it had
 * accumulated) retired 2026-08-12: Map is home now, the screen Juan actually
 * opens first in the field. This route survives only so old links and muscle
 * memory land somewhere true.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  permanentRedirect("/nutribiotic/map");
}
