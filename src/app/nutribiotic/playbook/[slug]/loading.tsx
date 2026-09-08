import { SkeletonBar } from "../../lib/ui";

/**
 * A long-form document: breadcrumb, title, blurb, then prose. Card-shaped bars
 * would be the wrong shape entirely, so this draws text-width lines at the
 * measure the Markdown body actually uses.
 */
export default function Loading() {
  return (
    <>
      <SkeletonBar className="mb-4 h-[15px] w-[86px]" />
      <div className="mb-6">
        <SkeletonBar className="h-[27px] w-[min(360px,66%)]" />
        <SkeletonBar className="mt-1.5 h-[19px] w-[min(52ch,90%)]" />
      </div>
      <div className="flex max-w-[70ch] flex-col gap-2.5">
        {["w-full", "w-[96%]", "w-[88%]", "w-full", "w-[72%]", "w-[94%]", "w-[60%]"].map((w, i) => (
          <SkeletonBar key={i} className={`h-[15px] ${w}`} />
        ))}
      </div>
    </>
  );
}
