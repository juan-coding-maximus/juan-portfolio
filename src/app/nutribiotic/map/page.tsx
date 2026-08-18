/**
 * Map. Every account owned by Juan in HubSpot, with a Places-verified pin.
 *
 * Both halves of that sentence are real filters, not framing: an account
 * belonging to another rep never appears here regardless of geocoding, and an
 * account of Juan's with no verified coordinates is named in the banner
 * rather than guessed onto the map at a postal centroid. See dal.ts
 * listOwnerAccounts() and geocode.py's corroboration rule.
 */

import {
  getMapDisplayPrefs,
  getRouteSchedulePrefs,
  isConfigured,
  listAreas,
  listOwnerAccounts,
} from "../lib/dal";
import { Empty, PageHead } from "../lib/ui";
import { MapScreen } from "./MapScreen";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [accounts, areas, displayPrefs, schedulePrefs] = await Promise.all([
    listOwnerAccounts(),
    listAreas(),
    getMapDisplayPrefs(),
    getRouteSchedulePrefs(),
  ]);

  return (
    <>
      {/* Subtitle removed on Juan's ask 2026-08-05. It explained the two
          filters behind the map (owner scope, Places-verified pin) to someone
          reading the page for the first time, and Juan reads it every day: it
          had become four lines of chrome above a map that needs the height.
          The rule it described is unchanged and still documented in this
          file's header and in dal.ts listOwnerAccounts. */}
      <PageHead title="Map" />

      {accounts.data.length === 0 ? (
        <Empty>
          {!isConfigured()
            ? "No data source configured."
            : "No accounts with a verified pin yet. Companies HubSpot has assigned to Juan still need to be reconciled on /nutribiotic/review before they exist here as accounts, then geocoded."}
        </Empty>
      ) : (
        <>
          <div className="mb-3 text-[12.5px] text-[#5B6560]">{accounts.data.length} accounts</div>
          {/* MapScreen owns the phone's position and shares it between the map
              (opens centred on Juan) and the ten-closest list under it. The
              height-floor note lives on there with the container it explains. */}
          <MapScreen
            accounts={accounts.data}
            areas={areas}
            initialShowChains={displayPrefs.showChains}
            initialShowPractices={displayPrefs.showPractices}
            schedulePrefs={schedulePrefs}
          />
        </>
      )}
    </>
  );
}
