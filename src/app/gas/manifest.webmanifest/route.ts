export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      id: "/gas",
      name: "Gas Stop",
      short_name: "Gas Stop",
      description: "The cheapest fill on the way to where you're going.",
      start_url: "/gas",
      scope: "/gas",
      display: "standalone",
      orientation: "portrait",
      background_color: "#F7F6F1",
      theme_color: "#F7F6F1",
      icons: [{ src: "/gas/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" }],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=0, must-revalidate" } },
  );
}
