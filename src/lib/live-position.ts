import type { Elev8ProgramData, Elev8ProgramItem, Elev8ProgramShow } from "./elev8-program";
import type { LiveState } from "./live-state-types";

export type DanceLiveStatus =
  | { kind: "not-live"; label: "Live show not active" }
  | { kind: "not-set"; label: "Live position not set" }
  | { kind: "on-stage-now"; label: "On stage now" }
  | { kind: "up-next"; label: "Up next" }
  | { kind: "away"; label: string; dancesAway: number }
  | { kind: "already-performed"; label: "Already performed" };

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function findLiveShow(program: Elev8ProgramData, liveState: LiveState) {
  return program.shows.find((show) => show.id === liveState.activeShowId) ?? null;
}

export function findLiveItem(show: Elev8ProgramShow | null, liveState: LiveState) {
  if (!show || !liveState.currentItemId) return null;
  return show.items.find((item) => item.id === liveState.currentItemId) ?? null;
}

export function getNextProgramItem(show: Elev8ProgramShow, currentItemId: string | null) {
  if (!currentItemId) return show.items[0] ?? null;

  const currentIndex = show.items.findIndex((item) => item.id === currentItemId);
  if (currentIndex < 0) return show.items[0] ?? null;

  return show.items[currentIndex + 1] ?? null;
}

export function getPreviousProgramItem(show: Elev8ProgramShow, currentItemId: string | null) {
  if (!currentItemId) return null;

  const currentIndex = show.items.findIndex((item) => item.id === currentItemId);
  if (currentIndex <= 0) return null;

  return show.items[currentIndex - 1] ?? null;
}

function getDanceItems(show: Elev8ProgramShow) {
  return show.items.filter((item) => item.type === "dance");
}

function getNextDanceIndexAfterProgramIndex(show: Elev8ProgramShow, programIndex: number) {
  const danceItems = getDanceItems(show);

  return danceItems.findIndex((dance) => show.items.findIndex((item) => item.id === dance.id) > programIndex);
}

export function getDanceLiveStatus(
  show: Elev8ProgramShow,
  dance: Elev8ProgramItem,
  liveState: LiveState,
): DanceLiveStatus {
  if (liveState.activeShowId !== show.id) {
    return { kind: "not-live", label: "Live show not active" };
  }

  if (!liveState.currentItemId) {
    return { kind: "not-set", label: "Live position not set" };
  }

  const programIndex = show.items.findIndex((item) => item.id === liveState.currentItemId);
  if (programIndex < 0) {
    return { kind: "not-set", label: "Live position not set" };
  }

  const currentItem = show.items[programIndex];
  const danceItems = getDanceItems(show);
  const targetDanceIndex = danceItems.findIndex((item) => item.id === dance.id);

  if (targetDanceIndex < 0) {
    return { kind: "not-set", label: "Live position not set" };
  }

  if (currentItem.type === "dance") {
    const currentDanceIndex = danceItems.findIndex((item) => item.id === currentItem.id);

    if (dance.id === currentItem.id) {
      return { kind: "on-stage-now", label: "On stage now" };
    }

    if (targetDanceIndex < currentDanceIndex) {
      return { kind: "already-performed", label: "Already performed" };
    }

    if (targetDanceIndex === currentDanceIndex + 1) {
      return { kind: "up-next", label: "Up next" };
    }

    const dancesAway = Math.max(1, targetDanceIndex - currentDanceIndex - 1);
    return {
      kind: "away",
      label: `${pluralize(dancesAway, "dance")} away`,
      dancesAway,
    };
  }

  const nextDanceIndex = getNextDanceIndexAfterProgramIndex(show, programIndex);

  if (nextDanceIndex < 0 || targetDanceIndex < nextDanceIndex) {
    return { kind: "already-performed", label: "Already performed" };
  }

  if (targetDanceIndex === nextDanceIndex) {
    return { kind: "up-next", label: "Up next" };
  }

  const dancesAway = Math.max(1, targetDanceIndex - nextDanceIndex);
  return {
    kind: "away",
    label: `${pluralize(dancesAway, "dance")} away`,
    dancesAway,
  };
}
