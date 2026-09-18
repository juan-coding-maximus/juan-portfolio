import type { Metadata } from "next";

import { MatrixView } from "./MatrixView";

// Its own installable screen: Add to Home Screen from here, and the tile
// opens straight on the matrix, not the scoring deck. See manifest.webmanifest
// for why that needs its own manifest file rather than the app's default one.
export const metadata: Metadata = {
  title: "Priority matrix",
  appleWebApp: { title: "Priorities" },
  manifest: "/agencypriorities/matrix/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true },
};

export default function MatrixPage() {
  return <MatrixView />;
}
