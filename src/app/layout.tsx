import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Barlow_Semi_Condensed, Saira_Condensed, Outfit } from "next/font/google";
import "./globals.css";

// Next/font serves "Big Shoulders" as a variable font with an opsz (optical size) axis
// covering the Display range; there is no distinct italic face, so the CSS's
// font-style: italic renders as a synthesized oblique, same as any other weight here.
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["800", "900"],
});

const barlow = Barlow_Semi_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const saira = Saira_Condensed({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["200", "300"],
});

const SITE_URL = "https://lap-one.vercel.app";
const SITE_DESCRIPTION = "A GT3 race car takes one lap of a procedural night circuit, driven by your scroll. A scroll-driven 3D film built with three.js and Next.js.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Lap One",
  description: SITE_DESCRIPTION,
  applicationName: "Lap One",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "Lap One",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Lap One",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lap One",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${barlow.variable} ${saira.variable} ${outfit.variable}`}>
      <body>{children}</body>
    </html>
  );
}
