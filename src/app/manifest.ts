import type { MetadataRoute } from "next";

/**
 * Web app manifest, scoped to /nutribiotic only.
 *
 * WHY THE SCOPE MATTERS. Next serves the manifest from the app root, so this
 * one file is linked from every page on juanarenas.bio, including the public
 * portfolio and /eldepartamento. `scope` is what stops it claiming them: a
 * browser only offers to install a page that sits inside the manifest's scope,
 * so the install prompt appears on the sales OS and nowhere else. Without it,
 * a visitor reading Juan's portfolio would be offered a private field-sales
 * tool as an app.
 *
 * WHAT THIS BUYS. On iOS, Add to Home Screen with `display: standalone` gives
 * the field workflow a real app icon and no browser chrome, which is the whole
 * point of reaching for a PWA. iOS needs no service worker for that, so there
 * isn't one here: this repo has already been bitten by a stale service worker
 * (the jobhunt dashboard needed a self-unregistering kill switch), and adding
 * one for installability it does not need would be taking that risk for free.
 *
 * A service worker becomes necessary only for web push, which also needs VAPID
 * keys and somewhere to store subscriptions. That is a later, separate step.
 *
 * ICONS ARE THE SITE'S, NOT THE DEPARTMENT'S. apple-touch-icon.png is Juan's
 * portfolio mark, declared at its real 180x180 rather than upscaled into a
 * blurry 512. It works, but the home-screen icon will read "juanarenas.bio"
 * instead of "NutriBiotic OS". A distinct mark is a design decision, not a
 * build one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/nutribiotic",
    name: "NutriBiotic OS",
    short_name: "NutriBiotic",
    description:
      "Field sales OS for the Southern California territory: today's route, accounts, touchpoint capture and the day's numbers.",
    start_url: "/nutribiotic",
    scope: "/nutribiotic",
    display: "standalone",
    orientation: "portrait",
    // The department's palette: off-white ground, near-black ink.
    background_color: "#FAF9F5",
    theme_color: "#14201B",
    icons: [
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
