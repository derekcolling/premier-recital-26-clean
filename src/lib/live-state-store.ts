import { Redis } from "@upstash/redis";
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

const LIVE_STATE_REDIS_KEY = "premier-recital:elev8:live-state";

function parseRedisLiveState(value: unknown): LiveState {
  if (!value || typeof value !== "object") return EMPTY_LIVE_STATE;

  const candidate = value as Partial<LiveState>;
  return {
    activeShowId: typeof candidate.activeShowId === "string" ? candidate.activeShowId : null,
    currentItemId: typeof candidate.currentItemId === "string" ? candidate.currentItemId : null,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
  };
}

function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  return new Redis({ url, token });
}

class RedisLiveStateStore implements LiveStateStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get() {
    return parseRedisLiveState(await this.redis.get(LIVE_STATE_REDIS_KEY));
  }

  async set(update: LiveStateUpdate) {
    const nextState: LiveState = {
      activeShowId: update.activeShowId,
      currentItemId: update.currentItemId,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(LIVE_STATE_REDIS_KEY, nextState);
    return nextState;
  }

  async clear() {
    const nextState: LiveState = {
      activeShowId: null,
      currentItemId: null,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(LIVE_STATE_REDIS_KEY, nextState);
    return nextState;
  }
}

let store: LiveStateStore | null = null;

export function getLiveStateStore() {
  if (store) return store;

  switch (process.env.LIVE_STATE_BACKEND ?? "mock-local") {
    case "upstash-redis": {
      const redis = createRedisClient();
      if (!redis) {
        throw new Error("LIVE_STATE_BACKEND=upstash-redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
      }

      store = new RedisLiveStateStore(redis);
      return store;
    }
    case "mock-local":
    default:
      store = new MockLocalLiveStateStore();
      return store;
  }
}
