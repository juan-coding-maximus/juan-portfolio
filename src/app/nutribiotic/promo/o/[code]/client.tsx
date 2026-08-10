"use client";

/**
 * Client pieces of the offer page: the bonus countdown, the request form with
 * live recomputed totals, and the print button. Everything renders FROM THE
 * SNAPSHOT passed down by the server page; the only client-side arithmetic is
 * the spec-sanctioned one, retotaling when the buyer edits a quantity, and the
 * server re-does that arithmetic on submit anyway.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { money, type Snapshot } from "../../../lib/promo";

/** Counts down the bonus only, never the base offer. Hides itself once elapsed. */
export function BonusCountdown({ label, until }: { label: string; until: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(new Date(until).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  if (left === null || left <= 0) return null;
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="no-print mt-4 flex items-center justify-between rounded-lg border border-[#E5D9BF] bg-[#FBF6E9] px-4 py-3">
      <span className="text-[14px] font-medium text-[#8A6D2F]">{label}</span>
      <span className="font-mono text-[16px] font-semibold tabular-nums text-[#8A6D2F]">
        {h}:{pad(m)}:{pad(s)}
      </span>
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print w-full rounded-lg border border-[#C9CEC6] bg-white px-4 py-2.5 text-[14px] font-medium text-[#3D4A44] hover:border-[#14201B] hover:text-[#14201B]"
    >
      Save as PDF
    </button>
  );
}

export function RequestForm({ snapshot, codeNorm }: { snapshot: Snapshot; codeNorm: string }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(snapshot.line_items.map((l) => [l.sku, l.qty_paid])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disc = snapshot.baseline_discount_pct || 0;
  const total = useMemo(
    () =>
      snapshot.line_items.reduce(
        (s, l) => s + (qty[l.sku] ?? l.qty_paid) * l.wholesale_each * (1 - disc / 100),
        0,
      ),
    [qty, snapshot, disc],
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // double submissions are the most common duplicate-order source
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/nutribiotic/api/promo/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeNorm,
          contact_name: f.get("contact_name"),
          company: f.get("company"),
          contact_email: f.get("contact_email"),
          contact_phone: f.get("contact_phone"),
          ship_address: f.get("ship_address"),
          notes: f.get("notes"),
          quantities: qty,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && data.redirect) {
        router.push(data.redirect);
        return;
      }
      setError(data?.error ?? "Something went wrong. Try again, or call Juan.");
    } catch {
      setError("Couldn't reach the server. Try again, or call Juan.");
    }
    setBusy(false);
  }

  const field =
    "w-full rounded-md border border-[#C9CEC6] bg-white px-3 py-2.5 text-[15px] outline-none placeholder:text-[#C2C8C0] focus:border-[#14201B]";

  return (
    <form onSubmit={submit} className="no-print mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rq-name" className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">Your name</label>
          <input id="rq-name" name="contact_name" required className={field} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="rq-co" className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">Business name</label>
          <input id="rq-co" name="company" required className={field} autoComplete="organization" />
        </div>
        <div>
          <label htmlFor="rq-email" className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">Email</label>
          <input id="rq-email" name="contact_email" type="email" required className={field} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="rq-phone" className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">Phone</label>
          <input id="rq-phone" name="contact_phone" type="tel" required className={field} autoComplete="tel" />
        </div>
      </div>

      <div>
        <span className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">Quantities</span>
        <div className="space-y-2 rounded-md border border-[#E2DFD5] bg-white p-3">
          {snapshot.line_items.map((l) => (
            <div key={l.sku} className="flex items-center justify-between gap-3">
              <label htmlFor={`qty-${l.sku}`} className="min-w-0 flex-1 truncate text-[14px]">
                {l.name}
                {l.qty_free > 0 && l.qty_paid > 0 && (
                  <span className="ml-1.5 text-[12px] text-[#5F7A56]">
                    +{Math.floor(((qty[l.sku] ?? l.qty_paid) * l.qty_free) / l.qty_paid)} free
                  </span>
                )}
              </label>
              <input
                id={`qty-${l.sku}`}
                type="number"
                min={0}
                max={999}
                value={qty[l.sku] ?? l.qty_paid}
                onChange={(e) => setQty((q) => ({ ...q, [l.sku]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) }))}
                className="w-20 rounded-md border border-[#C9CEC6] px-2 py-1.5 text-right text-[15px] tabular-nums outline-none focus:border-[#14201B]"
              />
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-[#E2DFD5] pt-2 text-[15px] font-semibold">
            <span>You pay</span>
            <span className="tabular-nums">{money(Math.round(total * 100) / 100)}</span>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="rq-ship" className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">Shipping address</label>
        <textarea id="rq-ship" name="ship_address" rows={2} required className={field} autoComplete="street-address" />
      </div>
      <div>
        <label htmlFor="rq-notes" className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">Notes for Juan</label>
        <textarea id="rq-notes" name="notes" rows={2} className={field} />
      </div>

      {error && <p className="text-[13.5px] font-medium text-[#8A4B2F]" role="alert">{error}</p>}

      <p className="text-[13px] leading-relaxed text-[#5B6560]">
        No payment now. Juan confirms pricing and freight, then invoices Net 30.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-[#14201B] px-4 py-3.5 text-[15.5px] font-semibold text-[#F7F6F1] disabled:opacity-60"
      >
        {busy ? "Sending…" : "Request this offer"}
      </button>
    </form>
  );
}
