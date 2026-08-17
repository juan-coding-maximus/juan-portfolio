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
 * The `next` value is attacker-reachable (anyone can hand Juan a gate link), so
 * it is matched against a fixed list here rather than interpolated. See
 * GateForm's safeNext for the same treatment on the redirect side.
 */

import type { Metadata } from "next";
import { LAUNCHERS } from "../lib/launchers";
import { GateForm } from "./GateForm";

export const dynamic = "force-dynamic";

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

  return {
    title: "Unlock · NutriBiotic OS",
    manifest: launcher.href,
    appleWebApp: { title: launcher.short_name },
    /* The icon has to move with the name and the manifest or the tile is a
       ClientOS launcher wearing the generic NB mark. An explicit icons entry
       overrides the segment's apple-icon.tsx for this route only. */
    icons: { apple: launcher.icon },
  };
}

export default function Gate() {
  return <GateForm />;
}
