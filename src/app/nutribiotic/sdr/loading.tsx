import { SkeletonBar } from "../lib/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonBar className="h-9 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonBar className="h-56 w-full" />
        <SkeletonBar className="h-56 w-full" />
        <SkeletonBar className="h-56 w-full" />
      </div>
    </div>
  );
}
