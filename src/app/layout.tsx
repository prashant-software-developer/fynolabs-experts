import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({ src: "./inter.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });

const site = (process.env.PUBLIC_SITE_NAME || "FynoLabs").trim();

export const metadata: Metadata = {
  title: { default: `${site} · Expert jobs`, template: `%s · ${site}` },
  description: "Remote work for engineers, scientists and domain experts in AI training and evaluation.",
  icons: { icon: "/icon.svg" },
  ...(process.env.PUBLIC_SITE_URL ? { metadataBase: new URL(process.env.PUBLIC_SITE_URL) } : {}),
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the admin theme script may add "dark" to <html> before React hydrates.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
