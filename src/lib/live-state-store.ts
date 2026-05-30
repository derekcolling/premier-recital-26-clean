import { Redis } from "@upstash/redis";
import { EMPTY_LIVE_STATE, type LiveState, type LiveStateUpdate } from "./live-state-types";

export interface LiveStateStore {
  backend: string;
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
  const previousState = getMemoryState();
  const nextState: LiveState = {
    activeShowId: update.activeShowId,
    currentItemId: update.currentItemId,
    countdownShowId: "countdownShowId" in update ? (update.countdownShowId ?? null) : (previousState.countdownShowId ?? null),
    updatedAt: new Date().toISOString(),
  };

  globalState.__premierRecitalLiveState = nextState;
  return nextState;
}

class MockLocalLiveStateStore implements LiveStateStore {
  backend = "mock-local";
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
const LIVE_STATE_SUPABASE_COMP_SLUG = "premier-recital-elev8";
const LIVE_STATE_SUPABASE_SOURCE = "override";

type SupabaseRuntimeEventRow = {
  current_entry_no: string | null;
  observed_at: string | null;
  payload: unknown;
};

function parseRedisLiveState(value: unknown): LiveState {
  if (!value || typeof value !== "object") return EMPTY_LIVE_STATE;

  const candidate = value as Partial<LiveState>;
  return {
    activeShowId: typeof candidate.activeShowId === "string" ? candidate.activeShowId : null,
    currentItemId: typeof candidate.currentItemId === "string" ? candidate.currentItemId : null,
    countdownShowId: typeof candidate.countdownShowId === "string" ? candidate.countdownShowId : null,
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
  backend = "upstash-redis";
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get() {
    return parseRedisLiveState(await this.redis.get(LIVE_STATE_REDIS_KEY));
  }

  async set(update: LiveStateUpdate) {
    const previousState = await this.get();
    const nextState: LiveState = {
      activeShowId: update.activeShowId,
      currentItemId: update.currentItemId,
      countdownShowId: "countdownShowId" in update ? (update.countdownShowId ?? null) : (previousState.countdownShowId ?? null),
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(LIVE_STATE_REDIS_KEY, nextState);
    return nextState;
  }

  async clear() {
    const nextState: LiveState = {
      activeShowId: null,
      currentItemId: null,
      countdownShowId: null,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(LIVE_STATE_REDIS_KEY, nextState);
    return nextState;
  }
}

function parseSupabaseLiveState(row: SupabaseRuntimeEventRow | null | undefined): LiveState {
  if (!row) return EMPTY_LIVE_STATE;

  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Partial<LiveState>) : {};
  return {
    activeShowId: typeof payload.activeShowId === "string" ? payload.activeShowId : null,
    currentItemId:
      typeof payload.currentItemId === "string"
        ? payload.currentItemId
        : typeof row.current_entry_no === "string"
          ? row.current_entry_no
          : null,
    countdownShowId: typeof payload.countdownShowId === "string" ? payload.countdownShowId : null,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : row.observed_at ?? null,
  };
}

function getSupabaseRestConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return {
    restUrl: `${url.replace(/\/$/, "")}/rest/v1/runtime_events`,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  };
}

class SupabaseRuntimeEventsLiveStateStore implements LiveStateStore {
  backend = "supabase-runtime-events";
  private readonly restUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: { restUrl: string; headers: Record<string, string> }) {
    this.restUrl = config.restUrl;
    this.headers = config.headers;
  }

  async get() {
    const params = new URLSearchParams({
      select: "current_entry_no,observed_at,payload",
      comp_slug: `eq.${LIVE_STATE_SUPABASE_COMP_SLUG}`,
      source: `eq.${LIVE_STATE_SUPABASE_SOURCE}`,
      order: "observed_at.desc",
      limit: "1",
    });
    const response = await fetch(`${this.restUrl}?${params.toString()}`, {
      cache: "no-store",
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Unable to read live state from Supabase (${response.status}).`);
    }

    const rows = (await response.json()) as SupabaseRuntimeEventRow[];
    return parseSupabaseLiveState(rows[0]);
  }

  async set(update: LiveStateUpdate) {
    const previousState = await this.get();
    const nextState: LiveState = {
      activeShowId: update.activeShowId,
      currentItemId: update.currentItemId,
      countdownShowId: "countdownShowId" in update ? (update.countdownShowId ?? null) : (previousState.countdownShowId ?? null),
      updatedAt: new Date().toISOString(),
    };

    const response = await fetch(this.restUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        comp_slug: LIVE_STATE_SUPABASE_COMP_SLUG,
        source: LIVE_STATE_SUPABASE_SOURCE,
        current_entry_no: nextState.currentItemId,
        stage: null,
        payload: nextState,
      }),
    });

    if (!response.ok) {
      throw new Error(`Unable to write live state to Supabase (${response.status}).`);
    }

    return nextState;
  }

  async clear() {
    return this.set({ activeShowId: null, currentItemId: null });
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
    case "supabase-runtime-events": {
      const config = getSupabaseRestConfig();
      if (!config) {
        throw new Error(
          "LIVE_STATE_BACKEND=supabase-runtime-events requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        );
      }

      store = new SupabaseRuntimeEventsLiveStateStore(config);
      return store;
    }
    case "mock-local":
    default:
      store = new MockLocalLiveStateStore();
      return store;
  }
}
