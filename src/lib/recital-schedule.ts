import { readFile } from "node:fs/promises";
import path from "node:path";

export type RecitalScheduleCategory =
  | "dress_rehearsal"
  | "recital_show_or_show_specific"
  | "costume_rehearsal"
  | "rehearsal_or_class"
  | "private";

export type RecitalScheduleEvent = {
  id: string;
  title: string;
  date: string;
  displayDate: string;
  start: string;
  end: string;
  time: string;
  location: string;
  who: string;
  notes: string;
  subcalendarIds: number[];
  category: RecitalScheduleCategory;
  allDay: boolean;
  isImportant: boolean;
  isPrivate: boolean;
};

export type RecitalScheduleDay = {
  date: string;
  displayDate: string;
  events: RecitalScheduleEvent[];
};

export type RecitalScheduleData = {
  pulledAt: string;
  sourceUrl: string;
  eventCount: number;
  days: RecitalScheduleDay[];
};

type SourceScheduleEvent = {
  id: string;
  title: string;
  date: string;
  display_date: string;
  start: string;
  end: string;
  time: string;
  location?: string;
  who?: string;
  notes?: string;
  subcalendar_ids?: number[];
  category: RecitalScheduleCategory;
  all_day?: boolean;
};

type SourceSchedule = {
  source_url: string;
  pulled_at: string;
  event_count: number;
  events: SourceScheduleEvent[];
};

const SCHEDULE_PATH = path.join(
  process.cwd(),
  "data",
  "teamup",
  "recital-week-2026-05-26-to-2026-05-31.json",
);

export function normalizeRoutineTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isImportantScheduleEvent(event: Pick<RecitalScheduleEvent, "title" | "category">) {
  const title = event.title.toLowerCase();

  return (
    event.category === "dress_rehearsal" ||
    event.category === "recital_show_or_show_specific" ||
    event.category === "costume_rehearsal" ||
    title.includes("bring costume") ||
    title.includes("finale") ||
    title.includes("daddy") ||
    title.includes("dude")
  );
}

function toEvent(event: SourceScheduleEvent): RecitalScheduleEvent {
  const base = {
    id: event.id,
    title: event.title,
    date: event.date,
    displayDate: event.display_date,
    start: event.start,
    end: event.end,
    time: event.time,
    location: event.location ?? "",
    who: event.who ?? "",
    notes: event.notes ?? "",
    subcalendarIds: event.subcalendar_ids ?? [],
    category: event.category,
    allDay: Boolean(event.all_day),
    isPrivate: event.category === "private",
  };

  return {
    ...base,
    isImportant: isImportantScheduleEvent(base),
  };
}

export function groupScheduleEvents(events: RecitalScheduleEvent[]): RecitalScheduleDay[] {
  const grouped = new Map<string, RecitalScheduleEvent[]>();

  for (const event of events) {
    grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
  }

  return [...grouped.entries()].map(([date, dayEvents]) => ({
    date,
    displayDate: dayEvents[0]?.displayDate ?? date,
    events: dayEvents,
  }));
}

export async function getRecitalScheduleData(): Promise<RecitalScheduleData> {
  const jsonText = await readFile(SCHEDULE_PATH, "utf8");
  const source = JSON.parse(jsonText) as SourceSchedule;
  const events = source.events.map(toEvent);

  return {
    pulledAt: source.pulled_at,
    sourceUrl: source.source_url,
    eventCount: events.length,
    days: groupScheduleEvents(events),
  };
}
