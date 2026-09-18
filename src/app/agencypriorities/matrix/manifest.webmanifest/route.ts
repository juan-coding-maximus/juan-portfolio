/**
 * The Home Screen tile for the priority matrix. Its own manifest, not the
 * portfolio's, because iOS Safari launches whatever `start_url` the linked
 * manifest names when a tile is tapped, not the page open when it was added.
 * See nutribiotic/lib/launchers.ts for the fuller version of this reasoning.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      id: "/agencypriorities/matrix",
      name: "Priority Matrix",
      short_name: "Priorities",
      description: "The scored hard rules, plotted by effort and yield.",
      start_url: "/agencypriorities/matrix",
      scope: "/agencypriorities",
      display: "standalone",
      orientation: "portrait",
      background_color: "#13201A",
      theme_color: "#13201A",
      icons: [
        { src: "/agencypriorities/matrix/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    },
  );
}
