import type { Metadata } from "next";
import { getElev8ProgramData } from "@/lib/elev8-program";
import { Elev8Admin } from "./elev8-admin";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "ELEV8 Live Admin - Premier Dance",
  description: "Set the live ELEV8 recital show position.",
  manifest: `${basePath}/elev8/admin/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "ELEV8 Admin",
  },
};

export default async function Elev8AdminPage() {
  const program = await getElev8ProgramData();

  return (
    <main className="dark min-h-dvh bg-[#07080b] text-white">
      <Elev8Admin program={program} />
    </main>
  );
}
