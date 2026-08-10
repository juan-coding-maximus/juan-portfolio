/**
 * Presentational pieces shared by the buyer pages. Server-safe (no state).
 *
 * The buyer surface deliberately reuses the OS's editorial system (off-white,
 * near-black ink, Fraunces heads, SVG icons, no emoji) but none of its chrome:
 * a store owner sees a page, not a workspace.
 */
import { Ico } from "../lib/ui";
import { REP, money, type PromoTemplate } from "../lib/promo";

export function RepContact({ phone, compact = false }: { phone: string | null; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "rounded-lg border border-[#E2DFD5] bg-white p-4"}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#14201B] font-[family-name:var(--font-fraunces)] text-[15px] font-semibold text-[#F7F6F1]">
        JA
      </div>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold">{REP.name}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-[#5B6560]">
          {phone && (
            <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-1.5 hover:text-[#14201B]">
              <Ico name="phone" size={13} />
              {phone}
            </a>
          )}
          <a href={`mailto:${REP.email}`} className="flex items-center gap-1.5 hover:text-[#14201B]">
            <Ico name="mail" size={13} />
            {REP.email}
          </a>
        </div>
      </div>
    </div>
  );
}

export function Wordmark() {
  return (
    <div className="text-center">
      <div className="font-[family-name:var(--font-fraunces)] text-[22px] font-semibold tracking-tight">
        NutriBiotic
      </div>
      <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.22em] text-[#8A928C]">
        Since 1981
      </div>
    </div>
  );
}

/**
 * The general offer, rendered from the published general template. When none
 * exists this renders nothing and callers fall back to contact-only; a
 * consolation discount that nobody authored does not get invented here.
 */
export function GeneralOfferCard({ tpl }: { tpl: PromoTemplate | null }) {
  if (!tpl) return null;
  return (
    <div className="rounded-lg border border-[#E2DFD5] bg-white p-5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#8A928C]">First order, any account</div>
      {tpl.headline && (
        <div className="mt-1.5 font-[family-name:var(--font-fraunces)] text-[21px] font-semibold tracking-tight">
          {tpl.headline}
        </div>
      )}
      {tpl.subhead && <p className="mt-1 text-[13.5px] leading-relaxed text-[#5B6560]">{tpl.subhead}</p>}
      {tpl.body_blocks.friction.length > 0 && (
        <ul className="mt-3 space-y-1">
          {tpl.body_blocks.friction.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[13.5px] text-[#3D4A44]">
              <Ico name="check" size={13} />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PriceRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${strong ? "text-[17px] font-semibold" : "text-[14px] text-[#5B6560]"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
}
