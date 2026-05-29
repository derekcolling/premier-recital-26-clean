"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  BookOpenText,
  Check,
  ChevronDown,
  Info,
  ListChecks,
  MapPin,
  Music2,
  Plus,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Elev8ProgramData, Elev8ProgramItem, Elev8ProgramShow } from "@/lib/elev8-program";
import { fallbackLiveState, fetchLiveState, isUninitializedLiveState } from "@/lib/live-state-client";
import { findLiveItem, findLiveShow } from "@/lib/live-position";
import type { LiveState } from "@/lib/live-state-types";

type BrowserMode = "live-program" | "full-program" | "my-dances" | "info";
type LegacySelections = Record<string, number[]>;

const TRACKER_STORAGE_KEY = "premier-recital-program-tracker-v1";
const LEGACY_TRACKER_STORAGE_KEY = "premier-recital-tracker-v1";
const LIVE_STATE_CACHE_KEY = "premier-recital-live-state-v1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const QUICK_CHANGE_DANCE_THRESHOLD = 3;
const ESTIMATED_DANCE_MINUTES = 3;
const ESTIMATED_NON_DANCE_MINUTES = 2;

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function showStorageKey(showNumber: number) {
  return String(showNumber);
}

function parseStoredIds(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseStoredLiveState(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as LiveState;
    const activeShowId = parsed.activeShowId ?? null;
    const currentItemId = parsed.currentItemId ?? null;
    const updatedAt = parsed.updatedAt ?? null;

    if (activeShowId !== null && typeof activeShowId !== "string") return null;
    if (currentItemId !== null && typeof currentItemId !== "string") return null;
    if (updatedAt !== null && typeof updatedAt !== "string") return null;

    return { activeShowId, currentItemId, updatedAt };
  } catch {
    return null;
  }
}

function cacheLiveState(state: LiveState) {
  try {
    if (isUninitializedLiveState(state)) return;
    window.localStorage.setItem(LIVE_STATE_CACHE_KEY, JSON.stringify(state));
  } catch {
    // Live state still updates for this session if localStorage is unavailable.
  }
}

function migrateLegacySelections(value: string | null, shows: Elev8ProgramShow[]) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as LegacySelections;

    return shows.flatMap((show) => {
      const selectedOrders = new Set(parsed[showStorageKey(show.showNumber)] ?? []);

      return show.items
        .filter((item) => item.type === "dance" && typeof item.order === "number" && selectedOrders.has(item.order))
        .map((item) => item.id);
    });
  } catch {
    return [];
  }
}

function filterKnownDanceIds(ids: string[], shows: Elev8ProgramShow[]) {
  const validIds = new Set(
    shows.flatMap((show) => show.items.filter((item) => item.type === "dance").map((item) => item.id)),
  );

  return ids.filter((id) => validIds.has(id));
}

function getTypeLabel(item: Elev8ProgramItem) {
  switch (item.type) {
    case "intermission":
      return "Intermission";
    case "filler":
      return "Filler";
    case "featured":
      return "Featured";
    case "finale":
      return "Finale";
    case "marker":
      return "Program";
    default:
      return "Dance";
  }
}

function parseShowStart(show: Elev8ProgramShow) {
  const [time = "12:00", modifier = "PM"] = show.startTime.split(" ");
  const [rawHours = "12", rawMinutes = "0"] = time.split(":");
  let hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (modifier.toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (modifier.toUpperCase() === "AM" && hours === 12) hours = 0;

  return new Date(`${show.date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
}

function getEstimatedShowEnd(show: Elev8ProgramShow) {
  const start = parseShowStart(show);
  const estimatedMinutes = show.items.reduce((total, item) => {
    if (typeof item.durationMinutes === "number") return total + item.durationMinutes;
    return total + (item.type === "dance" ? ESTIMATED_DANCE_MINUTES : ESTIMATED_NON_DANCE_MINUTES);
  }, 0);

  return new Date(start.getTime() + estimatedMinutes * 60 * 1000);
}

function getScheduledShow(shows: Elev8ProgramShow[], now = new Date()) {
  const sortedShows = [...shows].sort((first, second) => parseShowStart(first).getTime() - parseShowStart(second).getTime());

  for (const show of sortedShows) {
    if (getEstimatedShowEnd(show).getTime() > now.getTime()) {
      return show;
    }
  }

  return sortedShows[sortedShows.length - 1] ?? null;
}

function getAutoShowNumber(program: Elev8ProgramData, liveState: LiveState) {
  const liveShow = findLiveShow(program, liveState);
  return liveShow?.showNumber ?? getScheduledShow(program.shows)?.showNumber ?? program.shows[0]?.showNumber ?? 1;
}

function getSearchText(item: Elev8ProgramItem) {
  return [
    item.title,
    item.order?.toString() ?? "",
    item.type,
    item.teacher ?? "",
    item.songTitle ?? "",
    item.dancers.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function getTrackedDanceRows(show: Elev8ProgramShow, selectedIds: Set<string>) {
  const tracked = show.items.filter((item) => item.type === "dance" && selectedIds.has(item.id));

  return tracked.map((item, trackedIndex) => {
    const itemIndex = show.items.findIndex((candidate) => candidate.id === item.id);
    const previousTracked = tracked[trackedIndex - 1];
    const previousTrackedIndex = previousTracked
      ? show.items.findIndex((candidate) => candidate.id === previousTracked.id)
      : -1;
    const itemsBefore = show.items.slice(previousTrackedIndex + 1, itemIndex);
    const dancesBefore = itemsBefore.filter((candidate) => candidate.type === "dance");

    return {
      item,
      isFirstTrackedDance: trackedIndex === 0,
      programItemsBefore: itemsBefore.length,
      dancesBefore: dancesBefore.length,
      previousTracked,
      isQuickChange:
        trackedIndex > 0 && dancesBefore.length <= QUICK_CHANGE_DANCE_THRESHOLD,
    };
  });
}

function ShowProgramSelector({
  currentShow,
  shows,
  allowAutoFollow = true,
  isAutoFollowing,
  onSelectShow,
  onResumeAuto,
  searchValue,
  onSearchChange,
}: {
  currentShow: Elev8ProgramShow;
  shows: Elev8ProgramShow[];
  allowAutoFollow?: boolean;
  isAutoFollowing: boolean;
  onSelectShow: (showNumber: number) => void;
  onResumeAuto: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <section className="min-w-0 border-b border-white/10 pb-3">
      <div className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(16rem,0.9fr)_minmax(15rem,1fr)]">
        <label className="relative flex min-h-12 flex-1 items-center rounded-[6px] border border-white/15 bg-white/[0.04] pl-3 pr-10 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition focus-within:border-[#f5c542]/70 hover:border-white/25 hover:bg-white/[0.07]">
          <span className="sr-only">View another show program</span>
          <select
            value={currentShow.showNumber}
            onChange={(event) => onSelectShow(Number(event.target.value))}
            className="h-12 min-w-0 flex-1 appearance-none bg-transparent text-base font-bold text-white outline-none"
            aria-label="View another show program"
          >
            {shows.map((show) => (
              <option key={show.id} value={show.showNumber} className="bg-[#101114] text-white">
                {show.day} · {show.title} · {show.startTime}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-white/55"
          />
        </label>

        <div className="flex w-full min-w-0 gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search program</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45"
            />
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search"
              className="min-h-12 rounded-[6px] border-white/15 bg-white/5 pl-10 text-base text-white placeholder:text-white/45 focus-visible:border-white focus-visible:ring-white/20"
            />
          </label>

          {allowAutoFollow && !isAutoFollowing ? (
            <button
              type="button"
              onClick={onResumeAuto}
              className="flex min-h-12 shrink-0 items-center justify-center rounded-[6px] border border-[#1C4EFF]/60 px-3 text-xs font-bold text-[#aebcff] transition hover:bg-[#1C4EFF]/15"
            >
              Follow live
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProgramItemCard({
  item,
  isTracked,
  isCurrent,
  isPerformed,
  canTrack = true,
  canOpenDetails = true,
  onOpen,
  onToggle,
}: {
  item: Elev8ProgramItem;
  isTracked: boolean;
  isCurrent: boolean;
  isPerformed: boolean;
  canTrack?: boolean;
  canOpenDetails?: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const itemNumber = item.order ?? item.position;

  if (item.type !== "dance") {
    return (
      <div
        className={`grid min-w-0 grid-cols-[2.5rem_1fr] gap-3 rounded-[6px] border px-2 py-3 transition ${
          isCurrent
            ? "border-[#f5c542] bg-[#2a2108] text-white shadow-[0_0_0_1px_rgba(245,197,66,0.22)]"
            : isPerformed
              ? "border-white/8 bg-transparent text-white/38"
              : "border-white/10 bg-transparent text-white/70"
        } ${isCurrent ? "sticky top-[4.75rem] z-20 sm:top-20" : ""}`}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-[4px] text-xs font-bold ${
            isCurrent ? "bg-[#f5c542] text-[#171001]" : "border border-white/10 text-white/45"
          }`}
        >
          {itemNumber}
        </div>
        <div className="min-w-0 border-l border-white/10 pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8ea4ff]">
              {isCurrent ? "On stage now" : getTypeLabel(item)}
            </p>
            {isPerformed ? (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/35">
                Performed
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-white/78">{item.title}</p>
          {item.programNote ? <p className="mt-1 text-xs text-white/45">{item.programNote}</p> : null}
        </div>
      </div>
    );
  }

  const itemDetails = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] text-sm font-bold ${
          isCurrent ? "bg-[#f5c542] text-[#171001]" : "border border-white/10 bg-black/10 text-white"
        }`}
      >
        {itemNumber}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block min-w-0 text-base font-semibold leading-6 text-white">{item.title}</span>
          {isPerformed ? (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/35">
              Performed
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs font-medium text-white/50">
          {item.teacher ?? "Teacher not listed"}
          {item.songTitle ? ` · ${item.songTitle}` : ""}
        </span>
      </span>
      {isCurrent ? (
        <span className="ml-auto shrink-0 rounded-full border border-[#f5c542]/50 bg-[#f5c542] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#171001]">
          On stage
        </span>
      ) : null}
    </>
  );
  const itemDetailsClassName =
    "flex min-w-0 flex-1 items-center gap-3 rounded-[4px] p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C4EFF]";

  return (
    <article
      className={`min-w-0 rounded-[6px] border transition ${
        isCurrent
          ? "border-[#f5c542] bg-[#2a2108] shadow-[0_0_0_1px_rgba(245,197,66,0.22)]"
          : isPerformed
            ? "border-white/8 bg-white/[0.025] opacity-55"
            : "border-white/10 bg-white/5 hover:border-[#1C4EFF] hover:bg-white/8"
      } ${isCurrent ? "sticky top-[4.75rem] z-20 sm:top-20" : ""}`}
    >
      <div className="flex items-stretch gap-2 p-2">
        {canOpenDetails ? (
          <button type="button" onClick={onOpen} className={itemDetailsClassName}>
            {itemDetails}
          </button>
        ) : (
          <div className={itemDetailsClassName}>{itemDetails}</div>
        )}

        {canTrack && !isCurrent ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={`${isTracked ? "Remove" : "Track"} ${item.title}`}
            aria-pressed={isTracked}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/75 transition hover:border-[#1C4EFF] hover:bg-[#1C4EFF] hover:text-white"
          >
            {isTracked ? <Check aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function DanceDetailModal({
  dance,
  isTracked,
  isOnStage,
  canTrack = true,
  onClose,
  onToggle,
}: {
  dance: Elev8ProgramItem;
  isTracked: boolean;
  isOnStage: boolean;
  canTrack?: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/70 px-3 pb-3 pt-16 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${dance.title} details`}
      onClick={onClose}
    >
      <div
        className="max-h-[86dvh] w-full max-w-2xl overflow-y-auto rounded-[8px] border border-white/12 bg-[#101114] shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#101114]/95 p-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8ea4ff]">
              {dance.order ? `Program #${dance.order}` : "Dance"}
            </p>
            <h2 className="mt-1 text-xl font-bold leading-7 text-white">{dance.title}</h2>
            {dance.songTitle ? <p className="mt-1 text-sm text-white/55">{dance.songTitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <section className="grid gap-3 rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-3">
              <UserRound aria-hidden="true" className="size-5 text-[#1C4EFF]" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Teacher</p>
                <p className="mt-0.5 text-sm font-semibold text-white">{dance.teacher ?? "Teacher not listed"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Users aria-hidden="true" className="size-5 text-[#1C4EFF]" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Dancers</p>
                <p className="mt-0.5 text-sm font-semibold text-white">{pluralize(dance.dancers.length, "dancer")}</p>
              </div>
            </div>
          </section>

          {dance.programNote ? (
            <section className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Program Note</p>
              <p className="mt-1 text-sm leading-6 text-white/75">{dance.programNote}</p>
            </section>
          ) : null}

          <section className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Roster</p>
            {dance.dancers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {dance.dancers.map((dancer) => (
                  <span
                    key={dancer}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/80"
                  >
                    {dancer}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-white/60">No dancers listed.</p>
            )}
          </section>

          {dance.stageNote ? (
            <details className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-white/75">Stage note</summary>
              <p className="mt-2 text-sm leading-6 text-white/60">{dance.stageNote}</p>
            </details>
          ) : null}

          {isOnStage ? (
            <div className="rounded-[6px] border border-[#1C4EFF]/55 bg-[#071b55] p-3 text-sm font-bold text-white">
              On stage now
            </div>
          ) : canTrack ? (
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={isTracked}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-[6px] text-sm font-bold transition ${
                isTracked
                  ? "border border-[#1C4EFF] bg-[#0b1d3d] text-white"
                  : "bg-[#1C4EFF] text-white hover:bg-[#2d5cff]"
              }`}
            >
              {isTracked ? <Check aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
              {isTracked ? "Tracked" : "Track Dance"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RecitalBrowser({ program }: { program: Elev8ProgramData }) {
  const [selectedShowNumber, setSelectedShowNumber] = useState(program.shows[0]?.showNumber ?? 1);
  const [isAutoFollowingShow, setIsAutoFollowingShow] = useState(true);
  const [mode, setMode] = useState<BrowserMode>("live-program");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quickChangeEnabled, setQuickChangeEnabled] = useState(true);
  const [activeDance, setActiveDance] = useState<Elev8ProgramItem | null>(null);
  const [liveState, setLiveState] = useState<LiveState>(fallbackLiveState);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const currentShow = program.shows.find((show) => show.showNumber === selectedShowNumber) ?? program.shows[0];
  const normalizedQuery = query.trim().toLowerCase();
  const liveShow = findLiveShow(program, liveState);
  const activeLiveItem = findLiveItem(liveShow, liveState);
  const liveItem = liveShow && currentShow && liveShow.id === currentShow.id ? activeLiveItem : null;
  const liveItemIndex = liveItem && currentShow ? currentShow.items.findIndex((item) => item.id === liveItem.id) : -1;
  const isLiveProgramMode = Boolean(liveItem && liveItemIndex >= 0 && !normalizedQuery);

  const programItems = useMemo(() => {
    if (!currentShow) return [];
    if (!normalizedQuery) return currentShow.items;
    return currentShow.items.filter((item) => getSearchText(item).includes(normalizedQuery));
  }, [currentShow, normalizedQuery]);

  const liveProgramItems = isLiveProgramMode && currentShow ? currentShow.items.slice(liveItemIndex) : programItems;
  const fullProgramItems = programItems;

  const trackedRows = useMemo(() => {
    if (!currentShow) return [];
    return getTrackedDanceRows(currentShow, selectedIdSet);
  }, [currentShow, selectedIdSet]);

  const trackedCountForShow = trackedRows.length;
  const totalTrackedCount = selectedIds.length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedIds = filterKnownDanceIds(
        parseStoredIds(window.localStorage.getItem(TRACKER_STORAGE_KEY)),
        program.shows,
      );

      if (savedIds.length > 0) {
        setSelectedIds(savedIds);
        return;
      }

      const migratedIds = filterKnownDanceIds(
        migrateLegacySelections(window.localStorage.getItem(LEGACY_TRACKER_STORAGE_KEY), program.shows),
        program.shows,
      );
      if (migratedIds.length > 0) {
        setSelectedIds(migratedIds);
        window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(migratedIds));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [program.shows]);

  useEffect(() => {
    let isMounted = true;
    const cachedStateTimer = window.setTimeout(() => {
      const cachedState = parseStoredLiveState(window.localStorage.getItem(LIVE_STATE_CACHE_KEY));

      if (isMounted && cachedState && !isUninitializedLiveState(cachedState)) {
        setLiveState(cachedState);
      }
    }, 0);

    async function loadLiveState() {
      try {
        const nextState = await fetchLiveState();
        if (!isMounted) return;

        setLiveState((previousState) => {
          if (isUninitializedLiveState(nextState) && !isUninitializedLiveState(previousState)) {
            return previousState;
          }

          cacheLiveState(nextState);
          return nextState;
        });
      } catch {
        // Keep the last known live item visible through transient polling failures.
      }
    }

    void loadLiveState();
    const interval = window.setInterval(loadLiveState, 3000);

    return () => {
      isMounted = false;
      window.clearTimeout(cachedStateTimer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isAutoFollowingShow) return;

    const syncAutoShow = () => {
      setSelectedShowNumber(getAutoShowNumber(program, liveState));
    };

    syncAutoShow();
    const interval = window.setInterval(syncAutoShow, 60000);

    return () => window.clearInterval(interval);
  }, [isAutoFollowingShow, liveState, program]);

  if (!currentShow) return null;

  function persistSelections(nextIds: string[]) {
    try {
      window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // Tracking still works for this session if localStorage is unavailable.
    }
  }

  function toggleDance(danceId: string) {
    setSelectedIds((previous) => {
      const existing = new Set(previous);

      if (existing.has(danceId)) {
        existing.delete(danceId);
      } else {
        existing.add(danceId);
      }

      const next = program.shows.flatMap((show) =>
        show.items.filter((item) => item.type === "dance" && existing.has(item.id)).map((item) => item.id),
      );
      persistSelections(next);
      return next;
    });
  }

  function selectShow(showNumber: number, options: { manual?: boolean } = {}) {
    if (options.manual) setIsAutoFollowingShow(false);
    setSelectedShowNumber(showNumber);
    setQuery("");
    setActiveDance(null);
  }

  function resumeAutoFollowingShow() {
    setIsAutoFollowingShow(true);
    selectShow(getAutoShowNumber(program, liveState));
  }

  const modeOptions = [
    { id: "live-program" as const, label: "Live Program", icon: Music2 },
    { id: "full-program" as const, label: "Full Program", icon: BookOpenText },
    { id: "my-dances" as const, label: "My Dances", icon: ListChecks },
    { id: "info" as const, label: "Info", icon: Info },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07080b] px-3 py-2 sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/" aria-label="Premier Dance home" className="flex min-w-0 flex-1 items-center gap-3">
            <Image
              src={`${BASE_PATH}/elev82.svg`}
              alt="ELEV8"
              width={175}
              height={95}
              priority
              className="h-14 w-auto shrink-0 sm:h-16"
            />
            <div className="min-w-0 border-l border-white/15 pl-3 leading-tight">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white">{program.event.dateRange}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white/55">
                {program.event.venue.name}
              </p>
            </div>
          </Link>
          <Image
            src={`${BASE_PATH}/premier-monogram.png`}
            alt="Premier Dance"
            width={203}
            height={263}
            priority
            className="h-10 w-auto shrink-0 sm:h-12"
          />
        </div>
      </header>

      <section className="bg-[#07080b] px-3 pb-28 pt-3 sm:px-4 lg:px-8">
        <div className="mx-auto grid w-full max-w-3xl gap-4 [&>*]:min-w-0">
          {mode !== "info" ? (
            <ShowProgramSelector
              currentShow={currentShow}
              shows={program.shows}
              allowAutoFollow={mode === "live-program"}
              isAutoFollowing={isAutoFollowingShow}
              onSelectShow={(showNumber) => selectShow(showNumber, { manual: true })}
              onResumeAuto={resumeAutoFollowingShow}
              searchValue={query}
              onSearchChange={setQuery}
            />
          ) : null}

          {mode === "live-program" ? (
            <>
              <div className="grid min-w-0 gap-2" aria-live="polite">
                {liveProgramItems.length === 0 ? (
                  <div className="rounded-[6px] border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/70">
                    No program items match this search in Show {currentShow.showNumber}.
                  </div>
                ) : null}

                {liveProgramItems.map((item) => {
                  const isTracked = selectedIdSet.has(item.id);
                  const isCurrent = item.id === liveItem?.id;

                  return (
                    <ProgramItemCard
                      key={item.id}
                      item={item}
                      isTracked={isTracked}
                      isCurrent={isCurrent}
                      isPerformed={false}
                      onOpen={() => {
                        if (item.type === "dance") setActiveDance(item);
                      }}
                      onToggle={() => toggleDance(item.id)}
                    />
                  );
                })}

              </div>
            </>
          ) : null}

          {mode === "full-program" ? (
            <div className="grid min-w-0 gap-2" aria-live="polite">
              {fullProgramItems.length === 0 ? (
                <div className="rounded-[6px] border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/70">
                  No program items match this search in Show {currentShow.showNumber}.
                </div>
              ) : null}

              {fullProgramItems.map((item) => (
                <ProgramItemCard
                  key={item.id}
                  item={item}
                  isTracked={false}
                  isCurrent={false}
                  isPerformed={false}
                  canTrack={false}
                  canOpenDetails={false}
                  onOpen={() => {
                    if (item.type === "dance") setActiveDance(item);
                  }}
                  onToggle={() => undefined}
                />
              ))}
            </div>
          ) : null}

          {mode === "my-dances" ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-white/5 p-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Tracked</p>
                  <p className="mt-1 text-lg font-bold leading-6 text-white">
                    {trackedCountForShow} of {currentShow.danceCount} dances
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={quickChangeEnabled}
                  onClick={() => setQuickChangeEnabled((isEnabled) => !isEnabled)}
                  className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-bold transition ${
                    quickChangeEnabled
                      ? "border-[#1C4EFF]/70 bg-[#1C4EFF]/16 text-white"
                      : "border-white/10 bg-black/15 text-white/58"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                      quickChangeEnabled ? "bg-[#1C4EFF]" : "bg-white/12"
                    }`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white transition ${
                        quickChangeEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </span>
                  Quick Change
                </button>
              </div>

              {trackedRows.length === 0 ? (
                <div className="rounded-[8px] border border-white/10 bg-white/5 p-5">
                  <Music2 aria-hidden="true" className="size-7 text-[#1C4EFF]" />
                  <h2 className="mt-3 text-lg font-bold text-white">No tracked dances for this show</h2>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Open the Live Program tab and tap the plus next to each dance you want to follow.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode("live-program")}
                    className="mt-4 flex min-h-11 items-center justify-center rounded-[6px] bg-[#1C4EFF] px-4 text-sm font-bold text-white"
                  >
                    Open Live Program
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  {trackedRows.map((row) => {
                    const showQuickChangeMarker = quickChangeEnabled && row.isQuickChange;

                    return (
                      <Fragment key={row.item.id}>
                        {showQuickChangeMarker ? (
                          <div className="flex min-w-0 items-center gap-2 rounded-[6px] border border-[#f59e0b]/70 bg-[#2b1707] px-3 py-2 text-[#fed7aa]">
                            <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-[#ffb45c]" />
                            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-[#ffb45c]">
                              Quick Change
                            </span>
                            <span className="min-w-0 text-xs font-semibold leading-5 text-[#fed7aa]/90">
                              {pluralize(row.dancesBefore, "dance")} between routines
                            </span>
                          </div>
                        ) : null}
                        <article className="min-w-0 rounded-[6px] border border-white/10 bg-white/5 p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] bg-[#1C4EFF] text-sm font-bold text-white">
                              {row.item.order}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveDance(row.item)}
                                  className="min-w-0 flex-1 text-left text-base font-semibold leading-6 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C4EFF]"
                                >
                                  {row.item.title}
                                </button>
                              </div>
                              <p className="mt-1 text-xs font-medium text-white/50">
                                {row.item.teacher ?? "Teacher not listed"}
                                {row.item.songTitle ? ` · ${row.item.songTitle}` : ""}
                              </p>
                              <div className="mt-3 grid gap-1 text-xs leading-5 text-white/62">
                                <p>
                                  {row.isFirstTrackedDance ? "Before this dance" : "Since previous tracked dance"}:{" "}
                                  <span className="font-semibold text-white/82">
                                    {pluralize(row.programItemsBefore, "program item")}
                                  </span>
                                  {" / "}
                                  <span className="font-semibold text-white/82">
                                    {pluralize(row.dancesBefore, "dance")}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleDance(row.item.id)}
                              aria-label={`Remove ${row.item.title}`}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
                            >
                              <X aria-hidden="true" className="size-4" />
                            </button>
                          </div>
                        </article>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {mode === "info" ? (
            <div className="grid gap-3">
              <section className="rounded-[8px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#1C4EFF]" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Venue</p>
                    <h2 className="mt-1 text-2xl font-bold leading-8 text-white">{program.event.venue.name}</h2>
                    <p className="mt-1 text-sm text-white/60">{program.event.venue.address}</p>
                    <a
                      href={program.event.venue.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[6px] bg-white px-4 text-sm font-bold text-[#080808] transition hover:bg-white/90"
                    >
                      Open in Maps
                    </a>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 rounded-[8px] border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Photography</p>
                  <p className="mt-1 text-sm leading-6 text-white/75">{program.event.photographyRule}</p>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Phones</p>
                  <p className="mt-1 text-sm leading-6 text-white/75">{program.event.cellPhoneRule}</p>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Intermission</p>
                  <p className="mt-1 text-sm leading-6 text-white/75">{program.event.intermissionNote}</p>
                </div>
              </section>

              <section className="rounded-[8px] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Recital Help</p>
                <div className="mt-3 grid gap-2">
                  {program.event.helpNotes.map((note) => (
                    <p key={note} className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-white/72">
                      {note}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>

      <nav
        aria-label="Recital sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#07080b]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1 rounded-[10px] border border-white/10 bg-white/5 p-1 sm:gap-2">
          {modeOptions.map((item) => {
            const isSelected = mode === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  setQuery("");
                  if (item.id === "full-program") {
                    setIsAutoFollowingShow(false);
                  } else if (item.id === "live-program" && mode !== "live-program") {
                    resumeAutoFollowingShow();
                  }
                }}
                aria-current={isSelected ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[8px] px-1 text-center text-[10px] font-bold leading-tight transition sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                  isSelected ? "bg-[#1C4EFF] text-white" : "text-white/58 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className="size-5 sm:size-4" />
                <span>{item.label}</span>
                {item.id === "my-dances" && totalTrackedCount > 0 ? (
                  <span className="absolute right-2 top-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#1C4EFF]">
                    {totalTrackedCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.35rem)] right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-lg shadow-black/40 backdrop-blur transition hover:bg-white/25 sm:right-[calc(50%-23rem)]"
        aria-label="Back to top"
      >
        <ArrowUp aria-hidden="true" className="size-5" />
      </button>

      {activeDance ? (
        <DanceDetailModal
          dance={activeDance}
          isTracked={selectedIdSet.has(activeDance.id)}
          isOnStage={mode === "live-program" && activeDance.id === liveItem?.id}
          canTrack={mode !== "full-program"}
          onClose={() => setActiveDance(null)}
          onToggle={() => toggleDance(activeDance.id)}
        />
      ) : null}
    </>
  );
}
