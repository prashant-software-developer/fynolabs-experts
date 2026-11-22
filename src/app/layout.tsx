import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({ src: "./inter.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Expert Hub", template: "%s · Expert Hub" },
  description: "Internal: every expert in one place, matched to partner requirements.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
