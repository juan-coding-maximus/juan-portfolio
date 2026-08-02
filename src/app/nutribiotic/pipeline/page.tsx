/**
 * Pipeline merged into Clients (2026-07-20, renamed from Territory 2026-08-02).
 * The board and the weekly review render on /nutribiotic/clients now; this
 * route survives only so old links and muscle memory land somewhere true.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Pipeline() {
  permanentRedirect("/nutribiotic/clients");
}
