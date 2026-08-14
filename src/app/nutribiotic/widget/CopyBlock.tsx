"use client";

import { useState } from "react";
import { Ico } from "../lib/ui";

/**
 * A code block whose only job is to get onto a phone in one tap.
 *
 * A field OS install step that ends in "now select this text carefully" is an
 * install step that does not happen in a parking lot. The button is the point;
 * the visible text is there so Juan can see what he is about to paste rather
 * than trust a button blind.
 *
 * THE SECRET IS MASKED ON SCREEN AND WHOLE ON THE CLIPBOARD. This block exists
 * to display a bearer token, and a token rendered in plaintext leaks through
 * every channel that is not the clipboard: a screenshot, a screen share, a
 * shoulder, a recorded call. Copy always sends the real thing; the eye gets
 * dots unless Juan asks for the characters, which he only needs when something
 * is wrong. Learned the direct way: two screenshots of this page during its own
 * build put two tokens in a transcript, and both had to be rotated.
 */
export function CopyBlock({
  code,
  label,
  secret,
}: {
  code: string;
  label: string;
  /** Substring to mask on screen. Never altered on the clipboard. */
  secret?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const shown =
    secret && !revealed ? code.replace(secret, "•".repeat(Math.min(secret.length, 28))) : code;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#E2DFD5] bg-[#14201B]">
      <div className="flex items-center justify-between gap-3 border-b border-[#243029] px-3.5 py-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">{label}</span>
        <div className="flex items-center gap-2">
          {secret && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="rounded-md border border-[#2E3A33] px-2.5 py-1.5 text-[11.5px] font-medium text-[#8A928C] transition-colors hover:text-[#D6E0D8]"
            >
              {revealed ? "Hide token" : "Show token"}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#2C6A46] px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Ico name={copied ? "check" : "external"} size={12} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[11.5px] leading-relaxed text-[#D6E0D8]">
        <code>{shown}</code>
      </pre>
    </div>
  );
}
