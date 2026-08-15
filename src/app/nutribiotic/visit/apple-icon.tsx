/* A record dot, not a drawn microphone: at the size a home screen actually
   shows this, a mic is a grey smudge and a disc is unmistakable. See
   lib/launcher-icon.tsx. */
import { launcherIcon, LAUNCHER_SIZE } from "../lib/launcher-icon";

export const size = LAUNCHER_SIZE;
export const contentType = "image/png";

export default function VisitIcon() {
  return launcherIcon({ kind: "dot" }, "#2C6A46");
}
