import { NextResponse } from "next/server";

export function GET() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return NextResponse.json({
    id: `${basePath}/elev8/admin`,
    name: "ELEV8 Live Admin",
    short_name: "ELEV8 Admin",
    description: "Set the live ELEV8 recital show position.",
    start_url: `${basePath}/elev8/admin`,
    scope: `${basePath}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#07080b",
    theme_color: "#07080b",
    icons: [
      {
        src: `${basePath}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${basePath}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  });
}
