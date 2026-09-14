import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Gas",
  description: "The cheapest fill on the way to where you're going.",
  robots: { index: false, follow: false },
  manifest: "/gas/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Gas", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F7F6F1",
};

export default function GasLayout({ children }: { children: React.ReactNode }) {
  /* The portfolio's root body is ink; this tool is on the light system. The
     fixed, self-scrolling wrapper paints the whole viewport, overscroll
     included, without touching the shared body. */
  return <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-[#F7F6F1] text-[#14201B]">{children}</div>;
}
