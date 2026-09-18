import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "NutriBiotic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The department-wide share card. Every nutribiotic page that has not claimed
 * its own opengraph-image (see map/, sdr/, playbook/, outbound/, expenses/,
 * visit/) inherits this one, same as apple-icon.tsx is the icon fallback. It
 * carries the real NutriBiotic brand logo, never Juan's portrait, which the
 * root layout's static og-image.jpg was rendering for every nutribiotic URL
 * before this file existed.
 */
export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/img/logos/nutribiotic-white.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#14201B",
        }}
      >
        <img src={src} width={860} height={188} alt="" />
      </div>
    ),
    size,
  );
}
