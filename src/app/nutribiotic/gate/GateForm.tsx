"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Where to land after the PIN: the screen that was asked for, not a fixed home.
 *
 * The proxy puts the intended path in ?next when it bounces an unauthenticated
 * request here. Without it every Home Screen tile finished on the map once the
 * eight-hour session lapsed, which made ExpensOS and ClientOS the same app.
 *
 * VALIDATED HERE, NOT TRUSTED FROM THE URL. A value that decides a redirect is
 * attacker-reachable by definition (anyone can hand Juan a gate link), so this
 * accepts only an absolute path inside this OS. "/nutribiotic/..." cannot begin
 * with "//", which is what rules out the protocol-relative "//evil.com" form,
 * and the gate itself is excluded so a bounce cannot loop.
 */
function safeNext(search: string): string {
  const raw = new URLSearchParams(search).get("next");
  if (!raw || !raw.startsWith("/nutribiotic/")) return "/nutribiotic";
  if (raw.startsWith("/nutribiotic/gate")) return "/nutribiotic";
  return raw;
}

/**
 * A name for the tile being unlocked, sent so the devices list can say "iPhone ·
 * ClientOS" rather than three identical "iPhone" rows. Only the client knows
 * this: an installed web app sends the same User-Agent as Safari, and its start
 * path never reaches the server on the first load.
 */
function surfaceHint(): string {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return "browser";
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  if (next.startsWith("/nutribiotic/visit")) return "ClientOS";
  if (next.startsWith("/nutribiotic/expenses")) return "ExpensOS";
  return "home screen";
}

export function GateForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /* Default ON. Every device that reaches this screen is one of Juan's, the cap
     and the revoke list are what keep that from being a blank cheque, and a
     remember box he has to find and tick every time has not solved the problem
     he asked about. */
  const [remember, setRemember] = useState(true);
  /* The one case that must not redirect: he asked to be remembered and it did
     not happen, because the cap is full or the registry refused the write. He IS
     signed in; he just does not know yet that this tile will ask again tomorrow,
     and only this screen can tell him. */
  const [notRemembered, setNotRemembered] = useState<{ why: "full" | "error"; limit: number } | null>(
    null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/nutribiotic/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, remember, surface: surfaceHint() }),
      });
      const j = await res.json();
      if (j.ok && (j.remembered === "full" || j.remembered === "error")) {
        setNotRemembered({
          why: j.remembered,
          limit: typeof j.device_limit === "number" ? j.device_limit : 0,
        });
        return;
      }
      if (j.ok) {
        /* replace, not push: the gate has no business sitting in the back stack
           of a standalone tile, where Back would return to a login screen the
           session has already satisfied. Read off window rather than
           useSearchParams so this needs no Suspense boundary. */
        router.replace(safeNext(window.location.search));
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

  if (notRemembered !== null) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-5">
        <div className="w-full max-w-[360px]">
          <div className="font-[family-name:var(--font-fraunces)] text-[23px] font-semibold tracking-tight">
            Unlocked, not remembered
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#5B6560]">
            {notRemembered.why === "full"
              ? `${notRemembered.limit} devices are already remembered, which is the limit. You are signed in for the next eight hours, but this one will ask for the PIN again. Free a slot on the devices screen and unlock once more to keep it.`
              : "The PIN was right and you are signed in for the next eight hours, but the device registry refused the write, so this one will ask again. The devices screen says why."}
          </p>
          <button
            onClick={() => {
              router.replace(safeNext(window.location.search));
              router.refresh();
            }}
            className="mt-5 w-full rounded-md bg-[#14201B] px-3 py-2.5 text-[14px] font-medium text-[#F7F6F1]"
          >
            Continue
          </button>
          <a
            href="/nutribiotic/devices"
            className="mt-2.5 block w-full rounded-md border border-[#D8D4C8] bg-white px-3 py-2.5 text-center text-[14px] font-medium text-[#3D4A44]"
          >
            Manage devices
          </a>
        </div>
      </div>
    );
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

        <label className="mt-3.5 flex cursor-pointer items-center gap-2.5 text-[13.5px] text-[#3D4A44]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-[17px] w-[17px] shrink-0 accent-[#14201B]"
          />
          Remember this device
        </label>

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
