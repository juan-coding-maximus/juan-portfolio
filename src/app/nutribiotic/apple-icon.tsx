/* The OS itself: the NB wordmark. Screens Juan launches directly carry their
   own mark in the same family, see lib/launcher-icon.tsx. */
import { launcherIcon, LAUNCHER_SIZE } from "./lib/launcher-icon";

export const size = LAUNCHER_SIZE;
export const contentType = "image/png";

export default function AppleIcon() {
  return launcherIcon({ kind: "text", text: "NB" }, "#2C6A46");
}
