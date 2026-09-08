import { PageSkeleton } from "../lib/ui";

/* The parking-lot screen: the one where a stale cached render costs the most,
   because the code being generated has to be the one the buyer page will
   resolve. Tall first row stands in for the offer grid. */
export default function Loading() {
  return <PageSkeleton rows={3} sub rowHeight="h-24" />;
}
