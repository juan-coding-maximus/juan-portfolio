"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Gate() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/nutribiotic/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await res.json();
      if (j.ok) {
        router.push("/nutribiotic");
        router.refresh();
        return;
      }
      setErr(
        j.attempts_left != null && !j.locked
          ? `${j.message} ${j.attempts_left} attempt${j.attempts_left === 1 ? "" : "s"} left.`
          : j.message || "Could not unlock.",
      );
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
      setPin("");
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-[330px]">
        <div className="font-[family-name:var(--font-fraunces)] text-[23px] font-semibold tracking-tight">
          NutriBiotic OS
        </div>
        <p className="mt-1.5 text-[13.5px] text-[#5B6560]">Enter your PIN to unlock.</p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mt-5 w-full rounded-md border border-[#D8D4C8] bg-white px-3 py-2.5 text-[16px] tracking-[0.3em] outline-none focus:border-[#14201B]"
          placeholder="••••"
          aria-label="PIN"
        />

        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="mt-3 w-full rounded-md bg-[#14201B] px-3 py-2.5 text-[14px] font-medium text-[#F7F6F1] disabled:opacity-40"
        >
          {busy ? "Checking" : "Unlock"}
        </button>

        {err && (
          <p role="alert" className="mt-3 text-[13px] text-[#A0762C]">
            {err}
          </p>
        )}
      </form>
    </div>
  );
}
