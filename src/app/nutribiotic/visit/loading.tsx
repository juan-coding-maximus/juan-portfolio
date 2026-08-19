import { SkeletonBar } from "../lib/ui";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-8">
      <SkeletonBar className="h-[210px] w-full" />
      <SkeletonBar className="h-24 w-full" />
    </div>
  );
}
