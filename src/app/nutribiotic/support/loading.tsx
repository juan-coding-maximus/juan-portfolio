import { PageSkeleton } from "../lib/ui";

/* Support is a table, so the rows are row-height, not card-height. */
export default function Loading() {
  return <PageSkeleton rows={6} sub rowHeight="h-10" />;
}
