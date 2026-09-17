import type { Metadata } from "next";

import PriorityGame from "./PriorityGame";

// Juan's own operating rules, on his public professional domain. Nothing here
// is a secret, but it is not for prospective clients browsing the site either,
// so it stays out of every index and is linked from nowhere.
export const metadata: Metadata = {
  title: "Rule priorities",
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return <PriorityGame />;
}
