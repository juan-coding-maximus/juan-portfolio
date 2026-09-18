import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "ClientOS, NutriBiotic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Reuses this page's own real apple-icon.png (the leaves-only logo on ink,
// see apple-icon.tsx's doc comment) rather than drawing a second mark for it.
export default async function Image() {
  const mark = await readFile(join(process.cwd(), "src/app/nutribiotic/visit/apple-icon.png"));
  const src = `data:image/png;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          background: "#14201B",
          padding: "0 90px",
        }}
      >
        <img src={src} width={220} height={220} style={{ borderRadius: 110 }} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#F7F6F1", letterSpacing: -1 }}>
            ClientOS
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 4, background: "#6FAE39" }} />
            <div style={{ fontSize: 22, color: "#8FA89B", letterSpacing: 3, textTransform: "uppercase" }}>
              NutriBiotic
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
