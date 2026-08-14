/**
 * The home-screen icon for everything under /nutribiotic.
 *
 * Generated rather than committed as a PNG so it stays in step with the OS's
 * own palette (the light editorial direction: paper ground, near-black ink, one
 * green accent) instead of drifting into a second set of brand values kept in
 * an image file nobody opens.
 *
 * No custom font is loaded: ImageResponse would need the .ttf shipped in the
 * bundle for Fraunces, and a wordmark this size reads on weight and spacing
 * rather than on the serif.
 */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#F7F6F1",
        }}
      >
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -3,
            color: "#14201B",
            lineHeight: 1,
          }}
        >
          NB
        </div>
        <div style={{ width: 44, height: 4, background: "#2C6A46", marginTop: 14 }} />
      </div>
    ),
    size,
  );
}
