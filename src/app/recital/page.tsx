import type { Metadata } from "next";
import { RecitalBrowser } from "./recital-browser";
import { getRecitalData } from "@/lib/recital";
import { getRecitalScheduleData } from "@/lib/recital-schedule";

export const metadata: Metadata = {
  title: "ELEV8 Recital Tracker - Premier Dance",
  description: "Track recital routines and quick-change gaps for Premier Dance families.",
};

export default async function RecitalPage() {
  const [recital, schedule] = await Promise.all([getRecitalData(), getRecitalScheduleData()]);

  return (
    <main className="dark min-h-dvh overscroll-y-none bg-[#07080b] text-white">
      <RecitalBrowser shows={recital.shows} schedule={schedule} />
    </main>
  );
}
