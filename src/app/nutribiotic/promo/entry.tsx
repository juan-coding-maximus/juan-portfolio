"use client";

/**
 * Code entry. One input, validated on submit and never on keystroke: live
 * validation on a hand-copied code paints red at someone halfway through
 * typing. A miss is never a wall; the general offer and Juan's number render
 * inline under the message.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function CodeEntry({ fallback }: { fallback: ReactNode }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);

  // Autofocus on desktop only: on a phone the keyboard covering the page on
  // load reads as broken.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = input.current?.value.trim() ?? "";
    if (!code) return;
    setBusy(true);
    setMiss(null);
    try {
      const res = await fetch("/nutribiotic/api/promo/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 429) {
        setMiss("Too many tries. Give it a minute, or call Juan directly.");
      } else if (data?.found && data.redirect) {
        router.push(data.redirect);
        return;
      } else {
        setMiss("We couldn't find that code.");
      }
    } catch {
      setMiss("Something went wrong reaching the server. Try again, or call Juan directly.");
    }
    setBusy(false);
  }

  return (
    <>
      <form onSubmit={submit} className="mt-7">
        <label htmlFor="promo-code" className="block text-center font-[family-name:var(--font-fraunces)] text-[26px] font-semibold tracking-tight">
          Enter your code
        </label>
        <p className="mt-1.5 text-center text-[13.5px] text-[#5B6560]">
          It&apos;s handwritten on the sheet Juan left with you.
        </p>
        <input
          ref={input}
          id="promo-code"
          name="code"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          placeholder="JA-SPA-04-K7"
          className="mt-5 w-full rounded-lg border border-[#C9Cec6] bg-white px-4 py-4 text-center font-mono text-[22px] tracking-[0.12em] tabular-nums uppercase outline-none placeholder:text-[#C2C8C0] focus:border-[#14201B]"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-[#14201B] px-4 py-3.5 text-[15.5px] font-semibold text-[#F7F6F1] transition-opacity disabled:opacity-60"
        >
          {busy ? "Looking…" : "See my offer"}
        </button>
        <p className="mt-3 text-center text-[12.5px] text-[#8A928C]">No account. No password.</p>
      </form>

      {miss && (
        <div className="mt-8" role="status">
          <p className="text-center text-[14.5px] font-medium text-[#8A4B2F]">{miss}</p>
          <p className="mt-1 text-center text-[13px] text-[#5B6560]">
            Here&apos;s what we can still do, and Juan can sort the code out in a minute.
          </p>
          <div className="mt-4 space-y-3">{fallback}</div>
        </div>
      )}
    </>
  );
}
