/**
 * The fallback Home Screen tile for the OS itself, and for any screen added to
 * the Home Screen that has not claimed its own icon.
 *
 * The two screens Juan actually launches wear NutriBiotic's REAL marks, as
 * static PNGs beside their pages: expenses/apple-icon.png is the lettered logo
 * on white (ExpensOS), visit/apple-icon.png is the leaves-only logo on ink
 * (ClientOS). Two brand marks that differ only by the letters "NB" would be the
 * same tile at the size a Home Screen draws one, so the ground carries the
 * difference instead. Both are flattened opaque on purpose: iOS does no alpha
 * handling on an apple-touch-icon and a transparent one renders black.
 *
 * This one stays a generated wordmark rather than a third copy of the logo, so
 * the generic tile is never mistaken for one of the two real launchers. No
 * custom font is loaded: ImageResponse would need the Fraunces .ttf in the
 * bundle, and a mark this size reads on weight and spacing, not on the serif.
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
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, color: "#14201B", lineHeight: 1 }}>
          NB
        </div>
        <div style={{ width: 44, height: 4, background: "#2C6A46", marginTop: 14 }} />
      </div>
    ),
    size,
  );
}
