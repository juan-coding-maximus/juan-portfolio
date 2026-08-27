import { SkeletonBar } from "../lib/ui";

/**
 * Shaped to match what replaces it, not just to fill the space.
 *
 * The old version drew two bars and no heading, so when the real page streamed
 * in, PageHead's <h1> appeared above the capture card and shoved it down about
 * 60px, under a thumb already moving toward it. A skeleton that is the wrong
 * height is a skeleton that causes the jank it exists to hide. The first bar
 * stands in for the "Visit" heading at the same 27px/mb-6 rhythm PageHead uses
 * (see lib/ui.tsx), and the card bar carries the capture box's real min-height
 * plus its kind pills and grade row.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="mb-6">
        <SkeletonBar className="h-[27px] w-[92px]" />
      </div>
      <SkeletonBar className="h-[286px] w-full rounded-xl" />
      <div className="mt-8 flex flex-col gap-3">
        <SkeletonBar className="h-24 w-full" />
      </div>
    </div>
  );
}
