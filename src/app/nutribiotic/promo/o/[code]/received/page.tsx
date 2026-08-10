/**
 * Screen 3: confirmation. The order is already in the database (written before
 * anything else); this page restates it so the buyer never wonders whether it
 * went through.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Ico } from "../../../../lib/ui";
import { getCode, latestOrder } from "../../../../lib/promo-public";
import { PriceRow, RepContact } from "../../../ui";
import { PrintButton } from "../client";

export const metadata: Metadata = {
  title: "Request received · NutriBiotic",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReceivedPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = await getCode(raw);
  if (!code) redirect("/nutribiotic/promo/general");

  const order = await latestOrder(code.code_norm);
  const phone = process.env.NB_REP_PHONE ?? null;

  return (
    <div className="mx-auto max-w-[480px] px-5 py-14">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#14201B] text-[#F7F6F1]">
          <Ico name="check" size={22} />
        </div>
        <h1 className="mt-4 font-[family-name:var(--font-fraunces)] text-[26px] font-semibold tracking-tight">
          Request received
        </h1>
        <p className="mt-1.5 max-w-[40ch] text-[14.5px] leading-relaxed text-[#5B6560]">
          Juan will confirm pricing and shipping by email within one business day.
        </p>
        <div className="mt-2 font-mono text-[13px] tabular-nums text-[#8A928C]">{code.display_code}</div>
      </div>

      {order && (
        <div className="mt-7 rounded-lg border border-[#E2DFD5] bg-white p-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#8A928C]">Order summary</div>
          <ul className="mt-2 space-y-1 text-[14px] tabular-nums">
            {order.line_items.map((l) => (
              <li key={l.sku} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{l.name}</span>
                <span className="shrink-0">
                  {l.qty_paid} paid{l.qty_free > 0 && ` + ${l.qty_free} free`}
                </span>
              </li>
            ))}
          </ul>
          {order.totals && (
            <div className="mt-2 border-t border-[#EFEDE4] pt-2">
              <PriceRow label="You pay" value={order.totals.you_pay} strong />
            </div>
          )}
          <p className="mt-3 text-[12.5px] text-[#8A928C]">
            No payment now. Net 30 after Juan confirms.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <RepContact phone={phone} />
        <PrintButton />
      </div>
    </div>
  );
}
