/**
 * Shared building blocks for the per-page Home Screen tile (apple-icon.tsx)
 * and share card (opengraph-image.tsx) that a real nutribiotic page owns.
 *
 * Palette sampled from the two marks that already exist as static PNGs
 * (expenses/apple-icon.png, visit/apple-icon.png) so a generated tile sits in
 * the same family rather than inventing its own colors: ink ground, leaf
 * green accent, cream ink. A page's glyph is its own real NAV icon from
 * ui.tsx's ICONS, not a new symbol invented for the tile.
 */
import type { ReactNode } from "react";
import { ICONS } from "./ui";

export const INK = "#14201B";
export const CREAM = "#F7F6F1";
export const GREEN = "#2C6A46";
export const MUTED = "#8FA89B";

export function TileGlyph({ name, size = 84 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={CREAM}
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name] ?? ICONS.today}
    </svg>
  );
}

/** 180x180 Home Screen tile for a page that has claimed its own nav icon. */
export function PageAppleIcon({ icon }: { icon: string }): ReactNode {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: INK,
      }}
    >
      <TileGlyph name={icon} size={84} />
      <div style={{ width: 44, height: 4, background: GREEN, marginTop: 14 }} />
    </div>
  );
}

/** 1200x630 share card for a page that has claimed its own nav icon. */
export function PageOgCard({ icon, label }: { icon: string; label: string }): ReactNode {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        padding: "72px 84px",
      }}
    >
      <TileGlyph name={icon} size={128} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 68, fontWeight: 700, color: CREAM, letterSpacing: -1 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 4, background: GREEN }} />
          <div style={{ fontSize: 22, color: MUTED, letterSpacing: 3, textTransform: "uppercase" }}>
            NutriBiotic
          </div>
        </div>
      </div>
    </div>
  );
}
