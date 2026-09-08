import { SkeletonBar } from "../../lib/ui";

/**
 * The screen read in the car before walking in, so this one is hand-shaped
 * rather than a generic PageSkeleton: the heading is the account's own name
 * (wide, not the 40ch stub), the sub line is channel + address, and the body
 * below is a stat row over stacked detail cards. See visit/loading.tsx for the
 * rule this follows: a skeleton of the wrong height causes the jank it exists
 * to hide, and here the thumb is already moving toward the phone row.
 */
export default function Loading() {
  return (
    <>
      <div className="mb-6">
        <SkeletonBar className="h-[27px] w-[min(420px,70%)]" />
        <SkeletonBar className="mt-1.5 h-[19px] w-[min(340px,60%)]" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBar key={i} className="h-[72px] w-full rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <SkeletonBar className="h-[180px] w-full rounded-lg" />
        <SkeletonBar className="h-[140px] w-full rounded-lg" />
      </div>
    </>
  );
}
