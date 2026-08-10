/**
 * The fallback offer. Every failure path lands here (or renders this inline):
 * mistyped, expired, voided, or found eight months later, same resolution.
 * Nothing on the buyer surface 404s, ever.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { generalTemplate } from "../../lib/promo-public";
import { GeneralOfferCard, RepContact, Wordmark } from "../ui";

export const metadata: Metadata = {
  title: "NutriBiotic · first order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GeneralOfferPage() {
  const general = await generalTemplate();
  const phone = process.env.NB_REP_PHONE ?? null;

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-[420px] flex-col justify-center px-5 py-14">
      <Wordmark />
      <h1 className="mt-7 text-center font-[family-name:var(--font-fraunces)] text-[24px] font-semibold tracking-tight">
        Here&apos;s what we can do for a first order
      </h1>
      <div className="mt-5 space-y-3">
        <GeneralOfferCard tpl={general} />
        {!general && (
          <p className="text-center text-[14px] leading-relaxed text-[#5B6560]">
            Reach Juan directly and he&apos;ll put an offer together for your shop.
          </p>
        )}
        <RepContact phone={phone} />
      </div>
      <p className="mt-8 text-center text-[13px] text-[#8A928C]">
        Have a code?{" "}
        <Link href="/nutribiotic/promo" className="underline decoration-[#C9CEC6] underline-offset-2 hover:text-[#14201B]">
          Enter it here
        </Link>
      </p>
    </div>
  );
}
