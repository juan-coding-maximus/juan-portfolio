"use client";

import { useEffect, useState } from "react";

/**
 * The sample-data signal, fetched after the document closes.
 *
 * The guarantee is unchanged and still load-bearing: mode-level rather than a
 * per-row badge, above the content, impossible to miss on a cropped
 * screenshot. What changed is only WHEN it arrives. It used to be awaited in
 * the layout, which made every screen wait on it, then streamed from a
 * Suspense boundary, which held the response open. See api/workspace-mode.
 *
 * A synthetic workspace is a development state, so the extra beat before the
 * strip appears costs nothing real; production simply never renders it.
 */
export function SyntheticBanner() {
  const [synthetic, setSynthetic] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/nutribiotic/api/workspace-mode", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { synthetic?: boolean }) => setSynthetic(Boolean(d.synthetic)))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!synthetic) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-[#E5D9BF] bg-[#FBF6E9] px-4 py-1.5 text-[12px] text-[#8A6D2F]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#C9A24B]" aria-hidden />
      Sample data. Not real accounts, and nothing here can be sent or reported.
    </div>
  );
}
