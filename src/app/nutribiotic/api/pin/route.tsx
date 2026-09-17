/**
 * A numbered map-pin icon, rendered on demand for Google's Static Maps API.
 *
 * WHY THIS EXISTS. Google's static marker `label` parameter takes exactly one
 * character from {A-Z, 0-9} (https://developers.google.com/maps/documentation/
 * maps-static/start#Markers): there is no way to put a two-digit stop number
 * on a built-in pin. field_report.py used to fall back to a letter once a
 * week's stop count passed 9 (`chr(64 + n - 9)`), which is exactly the "calls
 * in letters" bug Juan flagged (2026-09-17) -- past the ninth stop of the
 * week, every pin on the map silently stopped being a number. This route
 * renders the pin as an image instead, so `icon:<this url>` can carry any
 * stop number Google's own `label:` field cannot.
 *
 * Same two colors static_map_url already draws with (#2563eb visit / #b45309
 * call), same shape family as the PDF's own `.pin` badge (field_report.py),
 * so a stop reads the same way on the map image as it does on the card next
 * to it.
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  visit: "#2563eb",
  call: "#b45309",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("n") ?? "").replace(/[^0-9A-Za-z]/g, "").slice(0, 3);
  const label = raw || "?";
  const kind = searchParams.get("c") === "call" ? "call" : "visit";
  const color = COLORS[kind];
  const size = 44;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          background: color,
          border: "3px solid #ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
          color: "#ffffff",
          fontSize: label.length > 2 ? 15 : 18,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        {label}
      </div>
    ),
    { width: size, height: size },
  );
}
