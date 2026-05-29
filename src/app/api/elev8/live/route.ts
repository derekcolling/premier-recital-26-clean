import { NextResponse, type NextRequest } from "next/server";
import { getElev8ProgramData } from "@/lib/elev8-program";
import { getLiveStateStore } from "@/lib/live-state-store";
import type { LiveStateUpdate } from "@/lib/live-state-types";

export const dynamic = "force-dynamic";

function liveStateResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function validateLiveStateUpdate(payload: unknown): Promise<LiveStateUpdate | { error: string }> {
  if (!payload || typeof payload !== "object") {
    return { error: "Expected live state payload." };
  }

  const update = payload as Partial<LiveStateUpdate>;
  const activeShowId = update.activeShowId ?? null;
  const currentItemId = update.currentItemId ?? null;

  if (activeShowId !== null && typeof activeShowId !== "string") {
    return { error: "activeShowId must be a string or null." };
  }

  if (currentItemId !== null && typeof currentItemId !== "string") {
    return { error: "currentItemId must be a string or null." };
  }

  if (!activeShowId && currentItemId) {
    return { error: "currentItemId requires an activeShowId." };
  }

  const program = await getElev8ProgramData();
  const activeShow = activeShowId ? program.shows.find((show) => show.id === activeShowId) : null;

  if (activeShowId && !activeShow) {
    return { error: `Unknown show: ${activeShowId}.` };
  }

  if (activeShow && currentItemId && !activeShow.items.some((item) => item.id === currentItemId)) {
    return { error: `Item ${currentItemId} does not belong to ${activeShow.id}.` };
  }

  return { activeShowId, currentItemId };
}

export async function GET() {
  const store = getLiveStateStore();
  return liveStateResponse(await store.get());
}

export async function PUT(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const update = await validateLiveStateUpdate(payload);

  if ("error" in update) {
    return liveStateResponse({ error: update.error }, 400);
  }

  const store = getLiveStateStore();
  return liveStateResponse(await store.set(update));
}

export async function DELETE() {
  const store = getLiveStateStore();
  return liveStateResponse(await store.clear());
}
