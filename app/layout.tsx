import type { Metadata, Viewport } from "next";
import { Unbounded, Instrument_Sans, Martian_Mono } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import WrongNetworkBar from "@/components/botchain/WrongNetworkBar";
import { app } from "@/lib/app-config";
import "./globals.css";

/**
 * Lean typography — three weights of conviction:
 *  - Unbounded:       display headings (poll questions, the hero tagline)
 *  - Instrument Sans: all UI text — labels, buttons, captions
 *  - Martian Mono:    numeric figures — BOT amounts, conviction scores, timestamps
 */
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
});

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
  openGraph: {
    title: app.name,
    description: app.tagline,
    type: "website",
    url: app.url,
  },
};

/** `width=device-width` + floor on zoom. Pinch-zoom stays available. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E6FFFA",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${instrumentSans.variable} ${martianMono.variable} h-full`}
      // The project accent applied once at root — all components read var(--accent).
      style={{ ["--accent" as string]: app.accent }}
    >
      <body className="min-h-full antialiased">
        <EvmProvider>
          <WrongNetworkBar />
          <ToastProvider>{children}</ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
