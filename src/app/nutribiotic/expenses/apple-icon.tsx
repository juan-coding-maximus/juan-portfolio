/* Amber, the colour this OS already uses for a receipt and for a stop that is
   not an account. See lib/launcher-icon.tsx. */
import { launcherIcon, LAUNCHER_SIZE } from "../lib/launcher-icon";

export const size = LAUNCHER_SIZE;
export const contentType = "image/png";

export default function ExpensesIcon() {
  return launcherIcon({ kind: "text", text: "$", size: 92 }, "#A0762C");
}
