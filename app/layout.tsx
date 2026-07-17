import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

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
    <html lang="en" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
