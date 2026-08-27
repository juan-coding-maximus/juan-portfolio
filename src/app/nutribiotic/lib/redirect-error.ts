/**
 * Next signals redirect() and notFound() by THROWING a sentinel error.
 *
 * Any `catch` that swallows one silently cancels it. That matters in these
 * fetch-my-own-data endpoints: the DAL's gate calls redirect() when a session
 * has lapsed, and a catch-all around the read turned "send him to the PIN
 * screen" into "return an empty queue and say nothing", which looks to the rep
 * exactly like a day with no follow-ups.
 *
 * Detected by digest rather than by class because the sentinel is internal and
 * not exported. The prefix is stable across the App Router.
 */
export function isNextControlFlowError(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}
