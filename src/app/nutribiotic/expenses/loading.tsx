import { SkeletonBar } from "../lib/ui";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4">
      <SkeletonBar className="h-9 w-40" />
      <SkeletonBar className="h-56 w-full" />
    </div>
  );
}
