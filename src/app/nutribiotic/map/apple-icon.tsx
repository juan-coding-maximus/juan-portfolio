import { ImageResponse } from "next/og";
import { PageAppleIcon } from "../lib/tile-marks";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<PageAppleIcon icon="pin" />, size);
}
