/**
 * Screen 2: the offer page. Rendered ENTIRELY from the code's frozen snapshot;
 * live product prices are never re-queried here, so a code handed to a buyer
 * cannot change underneath them.
 *
 * Block order maps to the buyer's questions in sequence (who is this from, what
 * is the deal, what does it cost me, what's my risk, can I trust it, how do I
 * take it) and should not be rearranged.
 *
 * States: expired renders read-only with the general offer beneath; requested
 * shows the submitted summary; void and unknown resolve to /general. Nothing
 * on this surface 404s.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Ico } from "../../../lib/ui";
import { REP, TERMS_PLAIN, clientTypeLabel, money } from "../../../lib/promo";
import { generalTemplate, getCode, latestOrder, markViewed } from "../../../lib/promo-public";
import { GeneralOfferCard, PriceRow, RepContact } from "../../ui";
import { BonusCountdown, PrintButton, RequestForm } from "./client";

export const metadata: Metadata = {
  title: "Your NutriBiotic offer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

function claimIcon(claim: string) {
  const c = claim.toLowerCase();
  if (c.includes("california") || c.includes("made in")) return "pin";
  if (c.includes("cgmp") || c.includes("compliant")) return "review";
  if (c.includes("tested")) return "check";
  if (c.includes("since") || c.includes("lineage")) return "flag";
  return "check";
}

export default async function OfferPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = await getCode(raw);
  if (!code || code.state === "void") redirect("/nutribiotic/promo/general");

  if (code.state === "issued") await markViewed(code.code_norm);

  const phone = process.env.NB_REP_PHONE ?? null;
  const s = code.snapshot;
  const expired = code.state === "expired";
  const requested = code.state === "requested";
  const order = requested ? await latestOrder(code.code_norm) : null;
  const general = expired ? await generalTemplate() : null;

  const bonusLive =
    !expired && !requested && code.bonus_label && code.bonus_expires_at &&
    new Date(code.bonus_expires_at) > new Date();

  return (
    <div className="mx-auto max-w-[560px] px-5 py-10 print:max-w-none print:px-0 print:py-0">
      {/* Print keeps the code, pricing, dates, terms and contact on one page and
          drops the countdown and the form; the second reader (the partner the
          proposal gets forwarded to) is often the one who decides. */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* 1 · Greeting: continuity from the handshake. */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#14201B] font-[family-name:var(--font-fraunces)] text-[16px] font-semibold text-[#F7F6F1]">
          JA
        </div>
        <div>
          <div className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
            {code.client_name ? `Hi ${code.client_name},` : "Hello,"}
          </div>
          <div className="text-[13px] text-[#5B6560]">
            put together by {REP.name}
            {phone && <> · {phone}</>}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="font-mono text-[13px] tabular-nums text-[#8A928C]">{code.display_code}</div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
            {clientTypeLabel(s.client_type)}
          </div>
        </div>
      </div>

      {expired && (
        <div className="mt-5 rounded-lg border border-[#E0C9C0] bg-[#F9EFEB] px-4 py-3 text-[14px] text-[#8A4B2F]">
          This offer expired on {dateLabel(code.expires_at)}. The numbers below are kept for reference;
          here&apos;s what we can still do, and Juan can reopen it in a minute.
        </div>
      )}

      {requested && (
        <div className="mt-5 rounded-lg border border-[#CBD8C6] bg-[#EFF4EC] px-4 py-3 text-[14px] text-[#4A6242]">
          You&apos;ve already sent this request. Juan will be in touch within one business day.
        </div>
      )}

      {/* 2 · Headline: the offer in plain words. */}
      <h1 className="mt-6 font-[family-name:var(--font-fraunces)] text-[30px] leading-[1.12] font-semibold tracking-tight">
        {s.headline || "Your first-order offer"}
      </h1>
      {s.subhead && <p className="mt-2 text-[15px] leading-relaxed text-[#5B6560]">{s.subhead}</p>}

      {/* 3 · Bonus countdown: bonus only, never the base offer. */}
      {bonusLive && <BonusCountdown label={`${code.bonus_label} ends in`} until={code.bonus_expires_at!} />}

      <div className="no-print mt-5">
        <PrintButton />
      </div>

      {/* 4 · Product cards. */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {s.line_items.map((l) => (
          <div key={l.sku} className="rounded-lg border border-[#E2DFD5] bg-white p-3.5">
            {l.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.image_url} alt={l.name} className="mb-2 h-24 w-full rounded object-contain" />
            ) : (
              <div className="mb-2 flex h-24 w-full items-center justify-center rounded bg-[#F2F0E9] text-[#C2C8C0]">
                <Ico name="accounts" size={22} />
              </div>
            )}
            <div className="text-[14px] font-semibold leading-snug">{l.name}</div>
            <div className="mt-0.5 text-[12.5px] text-[#5B6560]">
              {[l.size, l.case_pack ? `case of ${l.case_pack}` : null].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </div>

      {/* 5 · Pricing block: the centerpiece. Every figure from the snapshot. */}
      <div className="mt-5 rounded-lg border border-[#14201B] bg-white p-5">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[#8A928C]">Trial pricing</div>
        <table className="mt-3 w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.1em] text-[#8A928C]">
              <th className="pb-1.5 font-medium">Line</th>
              <th className="pb-1.5 text-right font-medium">Retail ea</th>
              <th className="pb-1.5 text-right font-medium">Trial ea</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {s.line_items.map((l) => (
              <tr key={l.sku} className="border-t border-[#EFEDE4]">
                <td className="py-1.5 pr-2">
                  {l.name}
                  <span className="text-[#8A928C]"> ×{l.qty_paid + l.qty_free}</span>
                  {l.qty_free > 0 && <span className="ml-1 text-[11.5px] font-medium text-[#5F7A56]">{l.qty_free} free</span>}
                </td>
                <td className="py-1.5 text-right">{money(l.retail_each)}</td>
                <td className="py-1.5 text-right font-semibold">{money(l.effective_each)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 space-y-1.5 border-t border-[#E2DFD5] pt-3">
          <PriceRow label="You pay" value={s.totals.you_pay} strong />
          {/* "Normally" is the same-goods-without-the-offer figure; when the
              offer IS plain wholesale the two are equal and repeating the
              number reads as a mistake, so it only renders when it differs. */}
          {s.totals.normally !== s.totals.you_pay && <PriceRow label="Normally" value={s.totals.normally} />}
          <PriceRow label="Retail value" value={s.totals.retail_value} />
        </div>
        {code.show_margin && s.margin_at_retail_pct !== null && (
          <div className="mt-3 rounded-md bg-[#F2F0E9] px-3 py-2 text-center text-[14px]">
            Margin at full retail: <span className="font-semibold tabular-nums">{s.margin_at_retail_pct}%</span>
            <span className="text-[#8A928C]"> · trial pricing</span>
          </div>
        )}
        {s.reorder_pricing_note && (
          <p className="mt-2 text-[12.5px] text-[#5B6560]">{s.reorder_pricing_note}</p>
        )}
      </div>

      {/* 6 · The one real date this system can promise. */}
      {!expired && (
        <div className="mt-4 flex items-center gap-2 text-[13.5px] text-[#5B6560]">
          <Ico name="clock" size={14} />
          Order by {dateLabel(bonusLive && code.bonus_expires_at ? code.bonus_expires_at : code.expires_at)}
          {bonusLive && <span className="text-[#8A928C]">to keep {code.bonus_label?.toLowerCase()}</span>}
        </div>
      )}

      {/* 7 · Risk removal, one idea: sell it before you pay for it. */}
      {s.friction.length > 0 && (
        <div className="mt-5 rounded-lg border border-[#E2DFD5] bg-white p-5">
          <div className="font-[family-name:var(--font-fraunces)] text-[17px] font-semibold tracking-tight">
            Sell it before you pay for it.
          </div>
          <ul className="mt-3 space-y-3">
            {s.friction.map((f) => (
              <li key={f} className="flex gap-2.5">
                <span className="mt-0.5 text-[#4A6242]">
                  <Ico name="check" size={14} />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-[#14201B]">{f}</span>
                  {TERMS_PLAIN[f] && (
                    <span className="block text-[13px] leading-relaxed text-[#5B6560]">{TERMS_PLAIN[f]}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 8 · Proof. Only what the template carries; nothing invented. */}
      {s.testimonial?.quote && (
        <blockquote className="mt-5 border-l-2 border-[#C9CEC6] pl-4 text-[14.5px] leading-relaxed text-[#3D4A44]">
          &ldquo;{s.testimonial.quote}&rdquo;
          {s.testimonial.attribution && (
            <footer className="mt-1 text-[12.5px] text-[#8A928C]">· {s.testimonial.attribution}</footer>
          )}
        </blockquote>
      )}

      {/* 9 · Claims. Filled chips (not outline pills) so trust markers read as
          badges/stamps rather than blend into the page's low-contrast borders. */}
      {s.claims.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {s.claims.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1.5 rounded-full bg-[#14201B] px-3 py-1.5 text-[12.5px] font-medium text-[#F7F6F1]"
            >
              <Ico name={claimIcon(c)} size={12} />
              {c}
            </span>
          ))}
        </div>
      )}

      {/* 10 · Request form, or what stands in its place. */}
      {!expired && !requested && (
        <div className="mt-7">
          <h2 className="font-[family-name:var(--font-fraunces)] text-[20px] font-semibold tracking-tight">
            Request this offer
          </h2>
          <RequestForm snapshot={s} codeNorm={code.code_norm} />
        </div>
      )}

      {requested && order && (
        <div className="mt-6 rounded-lg border border-[#E2DFD5] bg-white p-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#8A928C]">Your request</div>
          <ul className="mt-2 space-y-1 text-[14px] tabular-nums">
            {order.line_items.map((l) => (
              <li key={l.sku} className="flex justify-between">
                <span>{l.name}</span>
                <span>
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
        </div>
      )}

      {expired && (
        <div className="mt-6 space-y-3">
          <GeneralOfferCard tpl={general} />
        </div>
      )}

      <div className="no-print mt-6">
        <PrintButton />
      </div>

      {/* 11 · Footer: the rep again, where a second reader looks for a human. */}
      <div className="mt-4">
        <RepContact phone={phone} />
      </div>
    </div>
  );
}
