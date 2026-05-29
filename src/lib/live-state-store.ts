import { EMPTY_LIVE_STATE, type LiveState, type LiveStateUpdate } from "./live-state-types";

export interface LiveStateStore {
  get(): Promise<LiveState>;
  set(update: LiveStateUpdate): Promise<LiveState>;
  clear(): Promise<LiveState>;
}

type GlobalLiveState = typeof globalThis & {
  __premierRecitalLiveState?: LiveState;
};

function getMemoryState() {
  const globalState = globalThis as GlobalLiveState;
  if (!globalState.__premierRecitalLiveState) {
    globalState.__premierRecitalLiveState = EMPTY_LIVE_STATE;
  }

  return globalState.__premierRecitalLiveState;
}

function setMemoryState(update: LiveStateUpdate) {
  const globalState = globalThis as GlobalLiveState;
  const nextState: LiveState = {
    activeShowId: update.activeShowId,
    currentItemId: update.currentItemId,
    updatedAt: new Date().toISOString(),
  };

  globalState.__premierRecitalLiveState = nextState;
  return nextState;
}

class MockLocalLiveStateStore implements LiveStateStore {
  async get() {
    return getMemoryState();
  }

  async set(update: LiveStateUpdate) {
    return setMemoryState(update);
  }

  async clear() {
    return setMemoryState({ activeShowId: null, currentItemId: null });
  }
}

let store: LiveStateStore | null = null;

export function getLiveStateStore() {
  if (store) return store;

  switch (process.env.LIVE_STATE_BACKEND ?? "mock-local") {
    case "mock-local":
    default:
      store = new MockLocalLiveStateStore();
      return store;
  }
}
