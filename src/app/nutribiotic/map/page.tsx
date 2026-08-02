/**
 * Map. Every account owned by Juan in HubSpot, with a Places-verified pin.
 *
 * Both halves of that sentence are real filters, not framing: an account
 * belonging to another rep never appears here regardless of geocoding, and an
 * account of Juan's with no verified coordinates is named in the banner
 * rather than guessed onto the map at a postal centroid. See dal.ts
 * listOwnerAccounts() and geocode.py's corroboration rule.
 */

import { countOwnerWithoutCoordinates, isConfigured, listAreas, listOwnerAccounts } from "../lib/dal";
import { Empty, Ico, PageHead } from "../lib/ui";
import { AccountsMap } from "./AccountsMap";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [accounts, ungeocoded, areas] = await Promise.all([
    listOwnerAccounts(),
    countOwnerWithoutCoordinates(),
    listAreas(),
  ]);

  return (
    <>
      <PageHead
        title="Map"
        sub="Every account assigned to Juan in HubSpot with a Places-verified address, coloured by territory area. An account missing here is missing an address on file or has an unverified one, never an approximate guess."
      />

      {ungeocoded > 0 && (
        <p className="mb-4 flex items-start gap-1.5 text-[13px] text-[#A0762C]">
          <Ico name="alert" size={14} />
          <span>
            {ungeocoded} of Juan&rsquo;s account{ungeocoded === 1 ? "" : "s"} cannot appear yet:
            no verified pin. Run{" "}
            <code className="rounded bg-[#F3EFE3] px-1 py-0.5 text-[12.5px]">
              python3 bridges/nutribiotic/geocode.py --write --owner &quot;Juan Arenas Martin&quot;
            </code>{" "}
            to place them.
          </span>
        </p>
      )}

      {accounts.data.length === 0 ? (
        <Empty>
          {!isConfigured()
            ? "No data source configured."
            : "No accounts with a verified pin yet. Companies HubSpot has assigned to Juan still need to be reconciled on /nutribiotic/review before they exist here as accounts, then geocoded."}
        </Empty>
      ) : (
        <>
          <div className="mb-3 text-[12.5px] text-[#5B6560]">{accounts.data.length} accounts</div>
          {/* THE FILTER ROWS LIVE INSIDE THIS BOX, so its height is not the map's height:
              the area and tier rows take ~128px off the top. At the old 420px floor that
              left the map 292px tall, and fitBounds correctly solved for a zoom that fits
              500km of California into 292px, which is why the map opened showing Nevada
              and Texas. The floor has to clear the chrome before it is a map. */}
          <div className="h-[calc(100vh-240px)] min-h-[640px] overflow-hidden rounded-lg border border-[#E2DFD5]">
            <AccountsMap accounts={accounts.data} areas={areas} />
          </div>
        </>
      )}
    </>
  );
}
