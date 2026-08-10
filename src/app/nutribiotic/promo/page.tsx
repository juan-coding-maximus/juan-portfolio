/**
 * Screen 1 of the buyer surface: code entry. Public, PIN-free by design; the
 * proxy lets /nutribiotic/promo/* through and the layout renders bare (no OS
 * chrome) for anyone without a session. See promo-public.ts for the bounds.
 */
import type { Metadata } from "next";
import { generalTemplate } from "../lib/promo-public";
import { CodeEntry } from "./entry";
import { GeneralOfferCard, RepContact, Wordmark } from "./ui";

export const metadata: Metadata = {
  title: "Your NutriBiotic offer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PromoEntryPage() {
  const general = await generalTemplate();
  const phone = process.env.NB_REP_PHONE ?? null;

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-[420px] flex-col justify-center px-5 py-14">
      <Wordmark />
      <CodeEntry
        fallback={
          <>
            <GeneralOfferCard tpl={general} />
            <RepContact phone={phone} />
          </>
        }
      />
      <p className="mt-12 text-center text-[12px] text-[#8A928C]">
        <a href="https://nutribiotic.com" className="underline decoration-[#C9CEC6] underline-offset-2 hover:text-[#14201B]">
          nutribiotic.com
        </a>
      </p>
    </div>
  );
}
