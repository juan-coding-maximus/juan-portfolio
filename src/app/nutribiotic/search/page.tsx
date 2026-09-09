/**
 * Search. Draw an area on the map, sweep one category of business inside it,
 * and pick what goes on the SDR queue.
 *
 * The pipeline is bridges/nutribiotic/places_search_ingest.py; this screen is
 * its console. Read that script's module docstring before changing anything
 * here: the three stages, the drop reasons, the point-in-polygon test and the
 * triage weights are all its, and this page only ever displays what it returns.
 *
 * THE AREA IS AN ARBITRARY POLYGON, not a radius (Juan, 2026-09-09). A circle
 * is the wrong shape for a retail strip, a business district or the good half
 * of a neighbourhood, and Google's 60-result ceiling means the ground a search
 * wastes is enumeration it does not get. See search/AreaPicker.tsx.
 *
 * NOTHING RUNS ON ITS OWN, and each stage is its own click. Searching spends
 * real Google calls, looking further fetches real websites, and adding to SDR
 * is the only thing on this screen that writes a row. The page loads inert.
 *
 * SERVER SIDE IT READS NOTHING. Every fact on this screen comes from the
 * pipeline's own reply, so there is no data to fetch here and no gap between
 * what the script found and what the page claims.
 */

import { PageHead } from "../lib/ui";
import { SearchClient } from "./SearchClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search · NutriBiotic OS" };

export default function SearchPage() {
  return (
    <>
      <PageHead
        title="Search"
        sub="Drop pins around the area you want to work, search one category inside it, look further into the ones worth it, and add the best to the SDR queue. Nothing reaches HubSpot: a prospect earns a portal record the day someone actually talks to it."
      />
      <SearchClient />
    </>
  );
}
