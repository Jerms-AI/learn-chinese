import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Learn Chinese",
  description: "A personal AI-driven Mandarin tutor.",
};

// Phone: fill the notch area; keep pinch-zoom (a11y) — double-tap zoom is
// disabled via touch-action in globals.css so the hold-to-talk button doesn't
// zoom the page on a fast double press.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(fraunces.variable, inter.variable, "font-sans", geist.variable)}>
      <body className="bg-parchment text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
