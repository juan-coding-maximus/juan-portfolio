import { PageSkeleton } from "../lib/ui";

/* Devices renders PageHead with a sub line inside a max-w-[720px] column. */
export default function Loading() {
  return <PageSkeleton rows={3} sub width="max-w-[720px]" />;
}
