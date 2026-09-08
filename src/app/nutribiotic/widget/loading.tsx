import { PageSkeleton } from "../lib/ui";

/* Install-instruction cards in a max-w-[720px] column, gap-9 not gap-3, so
   fewer and taller bars is the honest shape. */
export default function Loading() {
  return <PageSkeleton rows={3} sub width="max-w-[720px]" rowHeight="h-40" />;
}
