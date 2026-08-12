"use client";

import { useState } from "react";

/**
 * Copy a draft body to the clipboard.
 *
 * Exists because an Outlook compose deep-link is a query string, and a long
 * body silently overruns what browsers and the endpoint will carry. When that
 * happens the link opens addressed and empty rather than looking fine and
 * arriving truncated, and this button is how the words get there.
 */
export function CopyBodyButton({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission refused. The body is on screen above either way,
      // so this degrades to selecting it by hand rather than to nothing.
      setCopied(false);
    }
  }

  return (
    <button
      onClick={copy}
      type="button"
      className="rounded-md border border-[#D8D4C8] px-3 py-1.5 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
    >
      {copied ? "Copied" : "Copy body"}
    </button>
  );
}
