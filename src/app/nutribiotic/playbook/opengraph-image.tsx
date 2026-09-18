import { ImageResponse } from "next/og";
import { PageOgCard } from "../lib/tile-marks";

export const alt = "Playbook, NutriBiotic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<PageOgCard icon="book" label="Playbook" />, size);
}
