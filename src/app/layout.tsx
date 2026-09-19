import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Juan Arenas Martin",
  description:
    "Juan Arenas Martin, pharmacologist and go-to-market operator in Los Angeles. Field Sales Manager at NutriBiotic. I build revenue systems for science companies.",
  openGraph: {
    title: "Juan Arenas Martin",
    description:
      "Juan Arenas Martin, pharmacologist and go-to-market operator in Los Angeles. Field Sales Manager at NutriBiotic. I build revenue systems for science companies.",
    images: [{ url: "/img/og-image.jpg", width: 1200, height: 1600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Juan Arenas Martin",
    description:
      "Juan Arenas Martin, pharmacologist and go-to-market operator in Los Angeles. Field Sales Manager at NutriBiotic. I build revenue systems for science companies.",
    images: ["/img/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hanken.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
