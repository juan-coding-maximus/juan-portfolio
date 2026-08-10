/**
 * Playbook used to carry its own separate PIN ("4174", hardcoded in source in
 * this public repo — trivially discoverable, and a second lock alongside the
 * main one is exactly the "too many layers" this rebuild was meant to avoid).
 * Folded into the single /nutribiotic session gate 2026-08-10: this shelf
 * reads local markdown files directly rather than through the DAL, so it
 * needs its own explicit check (the parent layout renders bare children when
 * unauthenticated rather than redirecting, to avoid the gate-redirecting-to-
 * itself loop — see nutribiotic/layout.tsx), but it checks the SAME session
 * as everything else now.
 */

import { redirect } from "next/navigation";
import { hasValidSession } from "../lib/session";

export default async function PlaybookLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await hasValidSession())) redirect("/nutribiotic/gate");
  return <>{children}</>;
}
