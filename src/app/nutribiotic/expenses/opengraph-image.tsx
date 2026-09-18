import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "ExpensOS, NutriBiotic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Reuses this page's own real apple-icon.png (the lettered logo on white,
// see apple-icon.tsx's doc comment) rather than drawing a second mark for it.
export default async function Image() {
  const mark = await readFile(join(process.cwd(), "src/app/nutribiotic/expenses/apple-icon.png"));
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
          background: "#FFFFFF",
          padding: "0 90px",
        }}
      >
        <img src={src} width={220} height={220} style={{ borderRadius: 110 }} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#14201B", letterSpacing: -1 }}>
            ExpensOS
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 4, background: "#2C6A46" }} />
            <div style={{ fontSize: 22, color: "#5B6560", letterSpacing: 3, textTransform: "uppercase" }}>
              NutriBiotic
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
