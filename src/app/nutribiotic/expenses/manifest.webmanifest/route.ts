/** ExpensOS's manifest: the tile that opens on clock-in.
 *  See ../../lib/launchers.ts. */
import { LAUNCHERS, manifestResponse } from "../../lib/launchers";

export const dynamic = "force-static";

export function GET() {
  return manifestResponse(LAUNCHERS.EXPENSOS);
}
