/**
 * Pipeline merged into Territory (2026-07-20). The board and the weekly review
 * render on /nutribiotic/accounts now; this route survives only so old links
 * and muscle memory land somewhere true.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Pipeline() {
  permanentRedirect("/nutribiotic/accounts");
}
