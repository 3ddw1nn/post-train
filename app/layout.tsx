import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });

export const metadata: Metadata = {
  title: {
    default: "Post Train — post everywhere in one trip",
    template: "%s · Post Train",
  },
  description:
    "Upload your content once and publish or schedule it across 10 social platforms. Flat pricing, unlimited posts, no per-channel fees.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={hanken.variable}>
      <body>{children}</body>
    </html>
  );
}
