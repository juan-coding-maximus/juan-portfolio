/**
 * Map. Every account owned by Juan in HubSpot, with a Places-verified pin.
 *
 * Both halves of that sentence are real filters, not framing: an account
 * belonging to another rep never appears here regardless of geocoding, and an
 * account of Juan's with no verified coordinates is named in the banner
 * rather than guessed onto the map at a postal centroid. See dal.ts
 * listOwnerAccounts() and geocode.py's corroboration rule.
 */

import { getMapDisplayPrefs, isConfigured, listAreas, listOwnerAccounts } from "../lib/dal";
import { Empty, PageHead } from "../lib/ui";
import { MapScreen } from "./MapScreen";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [accounts, areas, displayPrefs] = await Promise.all([
    listOwnerAccounts(),
    listAreas(),
    getMapDisplayPrefs(),
  ]);

  return (
    <>
      <PageHead
        title="Map"
        sub="Every account assigned to Juan in HubSpot with a Places-verified address, coloured by territory area. An account missing here is missing an address on file or has an unverified one, never an approximate guess."
      />

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
          />
        </>
      )}
    </>
  );
}
