import type { Metadata } from "next";
// TEMP-BUILD-PROBE: fonts removed (no network in sandbox)
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { RecoveryHandler } from "@/components/auth/RecoveryHandler";
import RouteTransitionIndicator from "@/components/layout/RouteTransitionIndicator";

const geistSans = { variable: "", className: "" };
const geistMono = { variable: "", className: "" };

export const metadata: Metadata = {
  title: "HydraSkript — AI-Powered Book Generation Platform",
  description: "Create full-length books with chapters, illustrations, and custom writing styles — all from a single prompt. Powered by AI.",
  keywords: ["AI", "book generation", "writing", "illustrations", "style training", "HydraSkript"],
  authors: [{ name: "HydraSkript Team" }],
  icons: {
    icon: "/HYDRASKRIPT_LOGO.png",
  },
  openGraph: {
    title: "HydraSkript — AI Book Generation",
    description: "Generate complete books with AI: chapters, illustrations, and custom styles.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-gray-100`}
        suppressHydrationWarning
      >
        <RecoveryHandler />
        {children}
        <RouteTransitionIndicator />
        <Toaster />
      </body>
    </html>
  );
}
