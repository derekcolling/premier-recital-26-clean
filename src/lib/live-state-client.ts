import { EMPTY_LIVE_STATE, type LiveState, type LiveStateUpdate } from "./live-state-types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const LIVE_STATE_ENDPOINT = `${BASE_PATH}/api/elev8/live`;

async function parseLiveStateResponse(response: Response) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to update live state.");
  }

  return (await response.json()) as LiveState;
}

export async function fetchLiveState() {
  const response = await fetch(LIVE_STATE_ENDPOINT, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  return parseLiveStateResponse(response);
}

export async function saveLiveState(update: LiveStateUpdate) {
  const response = await fetch(LIVE_STATE_ENDPOINT, {
    method: "PUT",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
  });

  return parseLiveStateResponse(response);
}

export async function clearLiveState() {
  const response = await fetch(LIVE_STATE_ENDPOINT, {
    method: "DELETE",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  return parseLiveStateResponse(response);
}

export function fallbackLiveState() {
  return EMPTY_LIVE_STATE;
}
