import OfflineSupport from "@/components/offline-support";
import { ThemeControls } from "@/components/theme-controls";
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner"
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" } as const;

export const metadata: Metadata = {
  title: "Comic Reader",
  description: "Your comic library, online and offline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="application-name" content="Comic Reader" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Comic Reader" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="none" />
        <meta name="msapplication-TileColor" content="#2B5797" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/icons/touch-icon-iphone.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/touch-icon-ipad.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/touch-icon-iphone-retina.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/touch-icon-ipad-retina.png" />

        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="shortcut icon" href="/favicon.ico" />

        {/* <meta name="twitter:card" content="summary" /> */}
        {/* <meta name="twitter:url" content="https://xcomic.vercel.app" /> */}
        {/* <meta name="twitter:title" content="Comic Reader" /> */}
        {/* <meta name="twitter:description" content="Comic Reader" /> */}
        {/* <meta name="twitter:image" content="https://xcomic.vercel.app/icons/android-chrome-192x192.png" /> */}
        {/* <meta name="twitter:creator" content="@" /> */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Comic Reader" />
        <meta property="og:description" content="Comic Reader" />
        <meta property="og:site_name" content="Comic Reader" />
        <meta property="og:url" content="https://xcomic.vercel.app" />
        <meta property="og:image" content="https://xcomic.vercel.app/icons/apple-touch-icon.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeControls>
          <OfflineSupport />
          {children}
          <Toaster />
        </ThemeControls>
      </body>
    </html>
  );
}
