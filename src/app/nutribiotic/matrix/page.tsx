/**
 * Matrix. Juan's board of projects and immediate to-dos, not the account
 * book: he adds each one by hand (a "+" in the quadrant it belongs to) or a
 * visit log surfaces it, checks it off when it's done, and it drops into the
 * success list at the foot of the screen. The account-priced version of this
 * screen (accounts placed by priority.ts's score) is matrix.ts's own logic
 * and still backs the Clients screen; this reads a separate hand-kept table
 * instead (nb_matrix_items, migration 0082) so the two never mix.
 */

import { getDoneMatrixTasks, getOpenMatrixTasks, isConfigured } from "../lib/dal";
import { MatrixScreen } from "../lib/matrix-ui";
import { Empty, PageHead } from "../lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Matrix · NutriBiotic OS" };

export default async function MatrixPage() {
  if (!isConfigured()) {
    return (
      <>
        <PageHead title="Matrix" />
        <Empty>No data source configured. Nothing is being shown, and nothing is being guessed.</Empty>
      </>
    );
  }

  const [open, done] = await Promise.all([getOpenMatrixTasks(), getDoneMatrixTasks()]);

  return (
    <>
      <PageHead title="Matrix" />
      <MatrixScreen initialOpen={open} initialDone={done} />
    </>
  );
}
