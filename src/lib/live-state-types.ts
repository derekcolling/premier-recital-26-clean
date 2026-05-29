export type LiveState = {
  activeShowId: string | null;
  currentItemId: string | null;
  updatedAt: string | null;
};

export type LiveStateUpdate = {
  activeShowId: string | null;
  currentItemId: string | null;
};

export const EMPTY_LIVE_STATE: LiveState = {
  activeShowId: null,
  currentItemId: null,
  updatedAt: null,
};
