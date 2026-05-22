import { readFile } from "node:fs/promises";
import path from "node:path";

type SourceShowItem = {
  order: number | null;
  title: string;
  type: "routine" | "intermission";
};

type SourceShow = {
  show_number: number;
  source_meta: string;
  items: SourceShowItem[];
  routine_count: number;
};

type SourceRecital = {
  source: string;
  source_url: string;
  linked_show_orders_doc: string;
  ticket_flower_form_url: string;
  title: string;
  app_event_summary: {
    date: string;
    display_date: string;
    venue: string;
    times: string[];
  };
  show_orders_doc_note: string;
  show_orders_doc: SourceShow[];
  gaps_and_conflicts: string[];
};

export type RecitalRoutine = {
  order: number | null;
  title: string;
  type: "routine" | "intermission";
  instructorOrOwner?: string;
};

export type RecitalShow = {
  showNumber: number;
  sourceMeta: string;
  routineCount: number;
  items: RecitalRoutine[];
};

export type RecitalData = {
  title: string;
  eventSummary: SourceRecital["app_event_summary"];
  ticketFlowerFormUrl: string;
  showOrdersDocNote: string;
  gapsAndConflicts: string[];
  shows: RecitalShow[];
  sources: {
    lovableApp: string;
    linkedShowOrdersDoc: string;
    linkedShowOrdersMarkdown: string;
  };
  sourceStats: {
    routineRows: number;
    intermissionRows: number;
  };
};

const RECITAL_DIR = path.join(process.cwd(), "data", "source-links", "recital");
const LINKED_SHOW_ORDER_MARKDOWN = path.join(
  process.cwd(),
  "research",
  "full-recital-schedule-2026.md",
);

function parseLinkedShowOrders(markdown: string): RecitalShow[] {
  const shows: RecitalShow[] = [];
  let currentShow: RecitalShow | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const showMatch = line.match(/^## Show #(\d+)\s+[—-]\s+(.+)$/);
    const routineMatch = line.match(/^(\d+)\.\s+(.+)$/);

    if (showMatch) {
      currentShow = {
        showNumber: Number(showMatch[1]),
        sourceMeta: showMatch[2].trim(),
        routineCount: 0,
        items: [],
      };
      shows.push(currentShow);
      continue;
    }

    if (!currentShow) continue;

    if (/^###\s+Intermission/i.test(line)) {
      currentShow.items.push({
        order: null,
        title: "Intermission",
        type: "intermission",
      });
      continue;
    }

    if (routineMatch) {
      currentShow.items.push({
        order: Number(routineMatch[1]),
        title: routineMatch[2].trim(),
        type: "routine",
      });
      currentShow.routineCount += 1;
    }
  }

  return shows;
}

export async function getRecitalData(): Promise<RecitalData> {
  const [jsonText, showOrderMarkdown] = await Promise.all([
    readFile(path.join(RECITAL_DIR, "lovable-recital-2026.json"), "utf8"),
    readFile(LINKED_SHOW_ORDER_MARKDOWN, "utf8"),
  ]);

  const source = JSON.parse(jsonText) as SourceRecital;
  const shows = parseLinkedShowOrders(showOrderMarkdown);
  const intermissionRows = shows.reduce(
    (total, show) => total + show.items.filter((item) => item.type === "intermission").length,
    0,
  );

  return {
    title: source.title,
    eventSummary: {
      date: "2026-05-30/2026-05-31",
      display_date: "Saturday, May 30 and Sunday, May 31, 2026",
      venue: source.app_event_summary.venue,
      times: ["Noon", "6:00 PM"],
    },
    ticketFlowerFormUrl: source.ticket_flower_form_url,
    showOrdersDocNote:
      "Schedule source: linked recital show-order document saved at research/full-recital-schedule-2026.md. Parent selections are local to this device.",
    gapsAndConflicts: [],
    shows,
    sources: {
      lovableApp: source.source_url,
      linkedShowOrdersDoc: source.linked_show_orders_doc,
      linkedShowOrdersMarkdown: "research/full-recital-schedule-2026.md",
    },
    sourceStats: {
      routineRows: shows.reduce((total, show) => total + show.routineCount, 0),
      intermissionRows,
    },
  };
}
