/**
 * The Home Screen launchers: one web app manifest per screen Juan actually
 * launches, rather than one manifest for the whole OS.
 *
 * WHY THIS FILE EXISTS. Adding a page to the Home Screen from Safari is the
 * only install path iOS offers, and since iOS 16.4 Safari reads the page's
 * linked manifest and launches `start_url`, not the page that was open when
 * the tile was made. There was one manifest at the app root (`id`/`start_url`
 * both `/nutribiotic`), linked from every page, so all three tiles were the
 * same app: tap ClientOS, land on the map. Naming the tile (`appleWebApp.title`)
 * and giving it its own icon had already been done; neither has any say over
 * where it opens.
 *
 * So each launcher carries its own manifest at its own URL, with:
 *   - `id`, which is what makes iOS treat these as THREE apps rather than three
 *     shortcuts into one. Two manifests sharing an id are one installed app.
 *   - `start_url`, the screen the tile opens on. The whole point.
 *   - `scope: /nutribiotic`, deliberately WIDER than start_url: the nav is still
 *     on screen inside the tile, and a scope narrowed to the launch screen would
 *     kick every nav tap out into Safari with an address bar.
 *
 * The link tag is declared per-route through `metadata.manifest` (see the layout
 * and the two pages). The old `src/app/manifest.ts` root convention was deleted
 * with this change: Next injects that one into EVERY page of the site, portfolio
 * included, and a second explicit link would have meant two <link rel="manifest">
 * tags racing on one page.
 *
 * ICONS. `/…/apple-icon.png` is the same static mark iOS already uses for the
 * tile (see apple-icon.tsx for why each is what it is). Declared at its real
 * 180x180 rather than claimed as a 512 it is not.
 */

import type { MetadataRoute } from "next";

type Launcher = {
  /** Manifest URL, also the value routes pass to `metadata.manifest`. */
  href: string;
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  icon: string;
};

const OS: Launcher = {
  href: "/nutribiotic/manifest.webmanifest",
  id: "/nutribiotic",
  name: "NutriBiotic OS",
  short_name: "NutriBiotic",
  description:
    "Field sales OS for the Southern California territory: today's route, accounts, touchpoint capture and the day's numbers.",
  start_url: "/nutribiotic/map",
  icon: "/nutribiotic/apple-icon",
};

const CLIENTOS: Launcher = {
  href: "/nutribiotic/visit/manifest.webmanifest",
  id: "/nutribiotic/visit",
  name: "ClientOS",
  short_name: "ClientOS",
  description:
    "File the interaction that just happened: type it or record it, and it lands in the OS, in HubSpot, and in the follow-up queue.",
  start_url: "/nutribiotic/visit",
  icon: "/nutribiotic/visit/apple-icon.png",
};

const EXPENSOS: Launcher = {
  href: "/nutribiotic/expenses/manifest.webmanifest",
  id: "/nutribiotic/expenses",
  name: "ExpensOS",
  short_name: "ExpensOS",
  description:
    "Clock in and out, log a break, and drop in a receipt or odometer photo. It files into this pay period's sheet.",
  start_url: "/nutribiotic/expenses",
  icon: "/nutribiotic/expenses/apple-icon.png",
};

export const LAUNCHERS = { OS, CLIENTOS, EXPENSOS };

export function manifestFor(l: Launcher): MetadataRoute.Manifest {
  return {
    id: l.id,
    name: l.name,
    short_name: l.short_name,
    description: l.description,
    start_url: l.start_url,
    /* Wider than start_url on purpose: the tile keeps the OS nav, and a tap on
       Map from inside ClientOS must stay standalone rather than opening Safari. */
    scope: "/nutribiotic",
    display: "standalone",
    orientation: "portrait",
    // The department's palette: off-white ground, near-black ink.
    background_color: "#FAF9F5",
    theme_color: "#14201B",
    icons: [
      { src: l.icon, sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}

/** One shape for all three route handlers. Public: iOS fetches a manifest
 *  while installing, sometimes outside Safari's cookie jar, and a manifest
 *  that 307s to the PIN gate installs a tile that opens the PIN gate. There is
 *  no data here, only names and colors. */
export function manifestResponse(l: Launcher): Response {
  return Response.json(manifestFor(l), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
