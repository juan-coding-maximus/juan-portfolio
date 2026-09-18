/**
 * The PIN gate. A server component wrapping the form for exactly one reason:
 * metadata.
 *
 * WHY THE GATE HAS TO CHOOSE A MANIFEST. Add to Home Screen installs whatever
 * manifest the page in front of you links, and if a tile is added from a signed
 * out browser the page in front of you is this one. With the layout's manifest
 * that installs the OS tile: right name, wrong app, opens the map. The proxy
 * already carries the intended path here in ?next, so the gate can link the
 * manifest of the screen he was actually going to and the tile comes out right
 * either way.
 *
 * SAME REASON FOR THE SHARE CARD. Proxy 307s any signed-out request straight to
 * this route, before the destination page ever renders, and an iMessage/social
 * scraper carries no cookie, so it is always signed out. That means the og:image
 * a shared nutribiotic link actually shows is THIS page's, never the destination
 * page's own opengraph-image.tsx, no matter how it is branded. So the same
 * next-based match below picks the right share image, or the department's own
 * mark as the default, rather than falling through to the root layout's
 * portrait (the bug this whole page's icons/og-image setup exists to fix).
 *
 * The `next` value is attacker-reachable (anyone can hand Juan a gate link), so
 * it is matched against a fixed list here rather than interpolated. See
 * GateForm's safeNext for the same treatment on the redirect side.
 */

import type { Metadata } from "next";
import { LAUNCHERS } from "../lib/launchers";
import { GateForm } from "./GateForm";

export const dynamic = "force-dynamic";

const TITLE = "Unlock · NutriBiotic OS";

// One entry per page with its own opengraph-image.tsx (see each page's file).
// Longest/most specific prefix first so /nutribiotic/visit doesn't shadow a
// more specific future child route.
const OG_IMAGE_ROUTES: [prefix: string, image: string][] = [
  ["/nutribiotic/visit", "/nutribiotic/visit/opengraph-image"],
  ["/nutribiotic/expenses", "/nutribiotic/expenses/opengraph-image"],
  ["/nutribiotic/map", "/nutribiotic/map/opengraph-image"],
  ["/nutribiotic/sdr", "/nutribiotic/sdr/opengraph-image"],
  ["/nutribiotic/playbook", "/nutribiotic/playbook/opengraph-image"],
  ["/nutribiotic/outbound", "/nutribiotic/outbound/opengraph-image"],
];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const raw = (await searchParams).next;
  const next = Array.isArray(raw) ? raw[0] : raw;

  const launcher = next?.startsWith("/nutribiotic/visit")
    ? LAUNCHERS.CLIENTOS
    : next?.startsWith("/nutribiotic/expenses")
      ? LAUNCHERS.EXPENSOS
      : LAUNCHERS.OS;

  const ogImage =
    OG_IMAGE_ROUTES.find(([prefix]) => next?.startsWith(prefix))?.[1] ?? "/nutribiotic/opengraph-image";

  return {
    title: TITLE,
    manifest: launcher.href,
    appleWebApp: { title: launcher.short_name },
    /* The icon has to move with the name and the manifest or the tile is a
       ClientOS launcher wearing the generic NB mark. An explicit icons entry
       overrides the segment's apple-icon.tsx for this route only. */
    icons: { apple: launcher.icon },
    /* Metadata objects are shallowly merged per field, but a nested field like
       openGraph is REPLACED wholesale by whichever segment defines any part of
       it (Next's own docs on generateMetadata), so this has to restate title
       rather than leave it to the root layout, or the card would carry "Juan
       Arenas" text beside NutriBiotic's own image. */
    openGraph: { title: TITLE, images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: TITLE, images: [ogImage] },
  };
}

export default function Gate() {
  return <GateForm />;
}
