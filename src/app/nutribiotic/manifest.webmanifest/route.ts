/** The OS tile's manifest. See ../lib/launchers.ts for why there are three. */
import { LAUNCHERS, manifestResponse } from "../lib/launchers";

export const dynamic = "force-static";

export function GET() {
  return manifestResponse(LAUNCHERS.OS);
}
