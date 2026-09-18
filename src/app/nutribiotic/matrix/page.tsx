/**
 * Matrix. Juan's ask, 2026-09-17: the agency's Eisenhower board, but better,
 * and for NutriBiotic only.
 *
 * It ranks nothing of its own. getPriorityBook() is the same call Map, SDR and
 * Outbound rank from, and lib/matrix.ts only splits what it already measured
 * into the two questions a 2x2 asks. So an account cannot be first here and
 * fifth on the map.
 */

import { getPriorityBook, isConfigured } from "../lib/dal";
import {
  URGENT_AT,
  byMatrixRank,
  placeOnMatrix,
  toMatrixRows,
  type MatrixItem,
} from "../lib/matrix";
import { MatrixScreen } from "../lib/matrix-ui";
import { Empty, PageHead } from "../lib/ui";

/** Carries a stored fact that says today, not merely a good score. */
function isUrgent(m: MatrixItem): boolean {
  return (m.urgency.value ?? 0) >= URGENT_AT;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Matrix · NutriBiotic OS" };

/**
 * The cap, and why there is one.
 *
 * The book is ~450 accounts and the "now"/"soon" bands alone ran to about a
 * third of it when priority.ts was tuned. A 2x2 holding 150 cards is a wall,
 * not a decision, and the whole reason this screen exists is to end the
 * morning question in one look. Forty is four cells of ten, which reads, and
 * the screen prints the cap against the live count rather than quietly
 * truncating.
 */
const CAP = 40;

export default async function MatrixPage() {
  if (!isConfigured()) {
    return (
      <>
        <PageHead title="Matrix" />
        <Empty>No data source configured. Nothing is being shown, and nothing is being guessed.</Empty>
      </>
    );
  }

  const book = await getPriorityBook();
  const placed = placeOnMatrix(book.ranked);

  /* Live work only. "later" is the long tail of the territory, and a board of
     everything Juan owns is the list he already has on Clients. */
  const live = placed.filter(
    (m) => m.result.band === "now" || m.result.band === "soon" || isUrgent(m),
  );

  /*
   * URGENT WORK IS NEVER CUT BY THE CAP.
   *
   * Sorting the live set by score and taking the top 40 looked right and was
   * not: score is mostly revenue, so a $40k account nobody has to call today
   * outranks a small one whose draft needs a reply this morning, and on the
   * first real run that filled quadrant IV with 22 unmeasured prospects while
   * quadrant III came out empty. A board that hides today's work behind this
   * quarter's is the wrong board. So anything carrying an urgency fact above
   * the line is taken first, whatever it scores, and the rest of the cap is
   * filled with the best-scoring of what is left.
   */
  const urgent = live.filter(isUrgent).sort(byMatrixRank).slice(0, CAP);
  const rest = live.filter((m) => !isUrgent(m)).sort(byMatrixRank);
  const top = [...urgent, ...rest.slice(0, Math.max(0, CAP - urgent.length))];

  if (top.length === 0) {
    return (
      <>
        <PageHead title="Matrix" />
        <Empty>
          Nothing scores as live work right now. The book holds {book.coverage.accounts} accounts
          and {book.coverage.scored} of them are scored.
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHead title="Matrix" />
      <MatrixScreen
        rows={toMatrixRows(top)}
        live={live.length}
        noUrgencyFact={top.filter((m) => m.urgency.value === null).length}
      />
    </>
  );
}
