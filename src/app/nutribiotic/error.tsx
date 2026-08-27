"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The net this segment never had.
 *
 * Until 2026-08-26 there was no error.tsx anywhere under app/, so any throw on
 * any NutriBiotic screen fell through to Next's default production error page:
 * a screen with no way back, no nav, and nothing that says which part failed.
 * On a phone in a parking lot that reads as "the app is gone".
 *
 * It matters more now that screens stream. A page that flushes its shell and
 * then throws leaves a half-built document, and without a boundary the browser
 * shows a load failure rather than a page with a problem in it. This keeps the
 * failure inside the segment and always offers the one screen that matters.
 *
 * `reset()` re-renders the segment without a full reload, which is the right
 * first try for the failure that actually happens here: one Supabase read that
 * timed out on a weak connection.
 */
export default function NutribioticError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server errors reach the client as an opaque digest, so this is the only
    // place the two halves can be tied together from a screenshot.
    console.error("[nutribiotic] render failed", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[600px] py-10">
      <h1 className="font-[family-name:var(--font-fraunces)] text-[24px] leading-tight font-semibold tracking-tight">
        This screen didn&rsquo;t load
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#5B6560]">
        Nothing was lost and nothing was written. Try it again, or go straight to logging a visit.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/nutribiotic/visit"
          className="rounded-md border border-[#E2DFD5] bg-white px-4 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
        >
          Log a visit
        </Link>
      </div>

      {error.digest && (
        <p className="mt-5 text-[11.5px] text-[#A9AFA9]">Reference {error.digest}</p>
      )}
    </div>
  );
}
