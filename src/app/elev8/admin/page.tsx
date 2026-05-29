import type { Metadata } from "next";
import { getElev8ProgramData } from "@/lib/elev8-program";
import { Elev8Admin } from "./elev8-admin";

export const metadata: Metadata = {
  title: "ELEV8 Live Admin - Premier Dance",
  description: "Set the live ELEV8 recital show position.",
};

export default async function Elev8AdminPage() {
  const program = await getElev8ProgramData();

  return (
    <main className="dark min-h-dvh bg-[#07080b] text-white">
      <Elev8Admin program={program} />
    </main>
  );
}
