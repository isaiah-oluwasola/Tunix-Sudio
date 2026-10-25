import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tunix Studio — Free Local AI Video Editor",
  description:
    "Tunix Studio is a browser-based video and image editor with a timeline, effects, text overlays, natural-language editing and optional local AI tools — no account, API key or database required.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0c0f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="overflow-hidden bg-[#0b0c0f] text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
