/**
 * Home-screen icons for the OS and for the screens Juan launches directly.
 *
 * ONE FAMILY, FOUR TILES. Every launcher shares the paper ground, the near-black
 * ink and the single accent rule, so a row of them reads as one app; only the
 * mark and the accent change, so none of them reads as another. Before this
 * there was one icon for the whole segment, which meant a Visit tile and an
 * Expenses tile sitting side by side as two identical NB squares, which is the
 * same as having no icon at all.
 *
 * MARKS ARE CHOSEN FOR 60pt, NOT 180. An icon is rendered at 180 and looked at
 * about a third of that on a home screen, so each mark is one shape or one or
 * two glyphs. "Expenses" spelled out would be a grey smudge; a dollar sign is
 * still a dollar sign.
 *
 * Generated rather than committed as PNGs so the palette cannot drift into a
 * second set of brand values living in image files nobody opens. No custom font
 * is loaded: ImageResponse would need the Fraunces .ttf in the bundle, and a
 * mark this size reads on weight and spacing rather than on the serif.
 */
import { ImageResponse } from "next/og";

export const LAUNCHER_SIZE = { width: 180, height: 180 };

const PAPER = "#F7F6F1";
const INK = "#14201B";

export type Mark =
  | { kind: "text"; text: string; size?: number }
  /** A filled disc. Reads as "record" at any size, where a drawn mic does not. */
  | { kind: "dot" };

export function launcherIcon(mark: Mark, accent: string) {
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
          background: PAPER,
        }}
      >
        {mark.kind === "dot" ? (
          <div style={{ width: 66, height: 66, borderRadius: 33, background: accent }} />
        ) : (
          <div
            style={{
              fontSize: mark.size ?? 76,
              fontWeight: 700,
              letterSpacing: -3,
              color: INK,
              lineHeight: 1,
            }}
          >
            {mark.text}
          </div>
        )}
        <div style={{ width: 44, height: 4, background: accent, marginTop: 14 }} />
      </div>
    ),
    LAUNCHER_SIZE,
  );
}
