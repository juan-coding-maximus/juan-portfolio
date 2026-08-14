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
 */
export function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

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
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#2C6A46] px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Ico name={copied ? "check" : "external"} size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[11.5px] leading-relaxed text-[#D6E0D8]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
