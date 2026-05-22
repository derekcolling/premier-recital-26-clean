import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ELEV8 Recital Tracker - Premier Dance",
  description: "Track recital routines, rehearsals, rooms, and show order for Premier Dance families.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "ELEV8 Recital",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-[#07080b] antialiased">
      <body className="min-h-full bg-[#07080b] text-white">{children}</body>
    </html>
  );
}
