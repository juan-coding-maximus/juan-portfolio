import { SkeletonBar } from "../lib/ui";

/** Shaped like what lands: the title, the view toggle, then the 2x2. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonBar className="h-9 w-32" />
      <SkeletonBar className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <SkeletonBar className="h-48 w-full" />
        <SkeletonBar className="h-48 w-full" />
        <SkeletonBar className="h-48 w-full" />
        <SkeletonBar className="h-48 w-full" />
      </div>
    </div>
  );
}
