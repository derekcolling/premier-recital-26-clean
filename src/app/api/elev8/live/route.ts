import { NextResponse, type NextRequest } from "next/server";
import { getElev8ProgramData } from "@/lib/elev8-program";
import { getLiveStateStore } from "@/lib/live-state-store";
import type { LiveStateUpdate } from "@/lib/live-state-types";

export const dynamic = "force-dynamic";

const LEGACY_ITEM_ID_ALIASES: Record<string, string> = {
  "show-1-05-mommy-and-me-filler": "show-1-05-mommy-and-me-dance",
};

function normalizeCurrentItemId(currentItemId: string | null) {
  if (!currentItemId) return currentItemId;
  return LEGACY_ITEM_ID_ALIASES[currentItemId] ?? currentItemId;
}

function liveStateResponse(payload: unknown, status = 200, backend = "unknown") {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Live-State-Backend": backend,
    },
  });
}

async function validateLiveStateUpdate(payload: unknown): Promise<LiveStateUpdate | { error: string }> {
  if (!payload || typeof payload !== "object") {
    return { error: "Expected live state payload." };
  }

  const update = payload as Partial<LiveStateUpdate>;
  const activeShowId = update.activeShowId ?? null;
  const rawCurrentItemId = update.currentItemId ?? null;
  const hasCountdownShowId = Object.prototype.hasOwnProperty.call(update, "countdownShowId");
  const countdownShowId = hasCountdownShowId ? (update.countdownShowId ?? null) : undefined;

  if (activeShowId !== null && typeof activeShowId !== "string") {
    return { error: "activeShowId must be a string or null." };
  }

  if (rawCurrentItemId !== null && typeof rawCurrentItemId !== "string") {
    return { error: "currentItemId must be a string or null." };
  }

  if (countdownShowId !== undefined && countdownShowId !== null && typeof countdownShowId !== "string") {
    return { error: "countdownShowId must be a string or null." };
  }

  const currentItemId = normalizeCurrentItemId(rawCurrentItemId);

  if (!activeShowId && currentItemId) {
    return { error: "currentItemId requires an activeShowId." };
  }

  const program = await getElev8ProgramData();
  const activeShow = activeShowId ? program.shows.find((show) => show.id === activeShowId) : null;

  if (activeShowId && !activeShow) {
    return { error: `Unknown show: ${activeShowId}.` };
  }

  if (typeof countdownShowId === "string" && !program.shows.some((show) => show.id === countdownShowId)) {
    return { error: `Unknown countdown show: ${countdownShowId}.` };
  }

  if (activeShow && currentItemId && !activeShow.items.some((item) => item.id === currentItemId)) {
    return { error: `Item ${currentItemId} does not belong to ${activeShow.id}.` };
  }

  return hasCountdownShowId ? { activeShowId, currentItemId, countdownShowId: countdownShowId ?? null } : { activeShowId, currentItemId };
}

export async function GET() {
  const store = getLiveStateStore();
  return liveStateResponse(await store.get(), 200, store.backend);
}

export async function PUT(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const update = await validateLiveStateUpdate(payload);

  if ("error" in update) {
    return liveStateResponse({ error: update.error }, 400);
  }

  const store = getLiveStateStore();
  return liveStateResponse(await store.set(update), 200, store.backend);
}

export async function DELETE() {
  const store = getLiveStateStore();
  return liveStateResponse(await store.clear(), 200, store.backend);
}
