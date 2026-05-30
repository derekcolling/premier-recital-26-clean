"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Loader2,
  Radio,
  RotateCcw,
} from "lucide-react";
import type { Elev8ProgramData, Elev8ProgramItem, Elev8ProgramShow } from "@/lib/elev8-program";
import {
  clearLiveState,
  fallbackLiveState,
  fetchLiveState,
  isUninitializedLiveState,
  saveLiveState,
} from "@/lib/live-state-client";
import { getNextProgramItem, getPreviousProgramItem, getProgramItemNumber } from "@/lib/live-position";
import type { LiveState } from "@/lib/live-state-types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function formatUpdatedAt(value: string | null) {
  if (!value) return "Not updated yet";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function getItemTypeLabel(item: Elev8ProgramItem) {
  if (item.type === "dance") return "Dance";
  if (item.type === "intermission") return "Intermission";
  if (item.type === "finale") return "Finale";
  if (item.type === "featured") return "Featured";
  return "Program";
}

function getSelectedShow(program: Elev8ProgramData, selectedShowId: string) {
  const show = program.shows.find((candidate) => candidate.id === selectedShowId) ?? program.shows[0];
  if (!show) throw new Error("No shows found in ELEV8 program data.");
  return show;
}

function LiveItemRow({
  item,
  isCurrent,
  onSetCurrent,
}: {
  item: Elev8ProgramItem;
  isCurrent: boolean;
  onSetCurrent: () => void;
}) {
  return (
    <article
      className={`min-w-0 rounded-[6px] border p-2 transition ${
        isCurrent ? "border-[#1C4EFF] bg-[#0b1d3d]" : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] text-sm font-bold ${
            isCurrent ? "bg-[#1C4EFF] text-white" : "border border-white/10 bg-black/15 text-white/70"
          }`}
        >
          {getProgramItemNumber(item)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-white">{item.title}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-white/45">
            {getItemTypeLabel(item)}
            {item.teacher ? ` · ${item.teacher}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onSetCurrent}
          aria-pressed={isCurrent}
          className={`flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[6px] px-3 text-xs font-bold transition ${
            isCurrent
              ? "border border-[#1C4EFF] bg-[#1C4EFF] text-white"
              : "border border-white/12 text-white/75 hover:border-[#1C4EFF] hover:bg-[#1C4EFF] hover:text-white"
          }`}
        >
          {isCurrent ? <Check aria-hidden="true" className="size-4" /> : <Radio aria-hidden="true" className="size-4" />}
          <span className="hidden sm:inline">{isCurrent ? "Current" : "Set current"}</span>
        </button>
      </div>
    </article>
  );
}

export function Elev8Admin({ program }: { program: Elev8ProgramData }) {
  const firstShowId = program.shows[0]?.id ?? "";
  const [liveState, setLiveState] = useState<LiveState>(fallbackLiveState());
  const [selectedShowId, setSelectedShowId] = useState(firstShowId);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShow = getSelectedShow(program, selectedShowId);
  const currentItem = selectedShow?.items.find((item) => item.id === liveState.currentItemId) ?? null;
  const isSelectedShowActive = liveState.activeShowId === selectedShow?.id;

  const activeShow = useMemo(
    () => program.shows.find((show) => show.id === liveState.activeShowId) ?? null,
    [liveState.activeShowId, program.shows],
  );
  const activeItem = activeShow?.items.find((item) => item.id === liveState.currentItemId) ?? null;
  const activeItemIndex = activeShow && activeItem ? activeShow.items.findIndex((item) => item.id === activeItem.id) : -1;
  const activeItemNumber = activeItem ? getProgramItemNumber(activeItem) : null;
  const audiencePreviewItems = activeShow && activeItemIndex >= 0 ? activeShow.items.slice(activeItemIndex, activeItemIndex + 4) : [];

  useEffect(() => {
    let isMounted = true;

    async function loadLiveState() {
      try {
        const nextState = await fetchLiveState();
        if (!isMounted) return;

        setLiveState((previousState) =>
          isUninitializedLiveState(nextState) && !isUninitializedLiveState(previousState)
            ? previousState
            : nextState,
        );
        if (!isUninitializedLiveState(nextState)) {
          setSelectedShowId(nextState.activeShowId ?? firstShowId);
        }
        setError(null);
      } catch (liveStateError) {
        if (!isMounted) return;
        setError(liveStateError instanceof Error ? liveStateError.message : "Unable to load live state.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadLiveState();
    const interval = window.setInterval(loadLiveState, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [firstShowId]);

  async function applyLiveState(activeShowId: string | null, currentItemId: string | null) {
    setIsSaving(true);
    setError(null);

    try {
      const nextState = await saveLiveState({ activeShowId, currentItemId });
      setLiveState(nextState);
      if (nextState.activeShowId) setSelectedShowId(nextState.activeShowId);
    } catch (liveStateError) {
      setError(liveStateError instanceof Error ? liveStateError.message : "Unable to save live state.");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetLiveState() {
    setIsSaving(true);
    setError(null);

    try {
      const nextState = await clearLiveState();
      setLiveState(nextState);
    } catch (liveStateError) {
      setError(liveStateError instanceof Error ? liveStateError.message : "Unable to clear live state.");
    } finally {
      setIsSaving(false);
    }
  }

  function selectShow(show: Elev8ProgramShow) {
    setSelectedShowId(show.id);
    void applyLiveState(show.id, null);
  }

  function setCurrentItem(item: Elev8ProgramItem) {
    void applyLiveState(selectedShow.id, item.id);
  }

  function advanceItem() {
    if (!selectedShow) return;
    const nextItem = getNextProgramItem(selectedShow, isSelectedShowActive ? liveState.currentItemId : null);
    if (nextItem) setCurrentItem(nextItem);
  }

  function previousItem() {
    if (!selectedShow || !isSelectedShowActive) return;
    const previous = getPreviousProgramItem(selectedShow, liveState.currentItemId);
    if (previous) setCurrentItem(previous);
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07080b] px-3 py-2 sm:px-4">
        <div className="mx-auto flex w-full max-w-4xl min-w-0 items-center justify-between gap-3">
          <Link href="/elev8" className="flex min-w-0 items-center gap-3 text-white">
            <ArrowLeft aria-hidden="true" className="size-5 shrink-0 text-white/60" />
            <Image
              src={`${BASE_PATH}/elev82.svg`}
              alt="ELEV8"
              width={175}
              height={95}
              priority
              className="h-12 w-auto shrink-0"
            />
          </Link>
          <div className="shrink-0 text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white">Live Admin</p>
            <p className="mt-1 text-[11px] font-medium text-white/50">{formatUpdatedAt(liveState.updatedAt)}</p>
          </div>
        </div>
      </header>

      <section className="px-3 pb-10 pt-3 sm:px-4">
        <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-4 [&>*]:min-w-0">
          <section className="grid min-w-0 gap-3 rounded-[8px] border border-white/10 bg-white/5 p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Live Control</p>
                <h1 className="mt-1 break-words text-xl font-bold text-white">
                  {activeShow && activeItem ? `${activeShow.title}: ${activeItem.title}` : "No item currently on stage"}
                </h1>
                <p className="mt-1 text-sm text-white/55">
                  {activeShow ? activeShow.label : "Choose a show below to start the live tracker."}
                </p>
              </div>
              {isLoading || isSaving ? <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin text-[#8ea4ff]" /> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="rounded-[6px] border border-[#f5c542]/45 bg-[#2a2108] p-3 text-center shadow-[0_0_0_1px_rgba(245,197,66,0.12)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f5c542]/80">
                  {activeItem?.type === "intermission" ? "Selected" : "Selected #"}
                </p>
                <p className="mt-1 text-5xl font-black leading-none text-[#f5c542]">{activeItemNumber ?? "—"}</p>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">
                  {activeItem ? getItemTypeLabel(activeItem) : "Waiting"}
                </p>
              </div>

              <div className="grid min-w-0 gap-2 rounded-[6px] border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Audience App Is Showing</p>
                {activeShow && activeItem ? (
                  <>
                    <div className="min-w-0 rounded-[6px] border border-[#f5c542]/35 bg-[#f5c542]/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f5c542]">Top card · On stage now</p>
                      <p className="mt-1 break-words text-lg font-bold leading-6 text-white">
                        {activeItem.type === "intermission" ? activeItem.title : `#${activeItemNumber} ${activeItem.title}`}
                      </p>
                      <p className="mt-1 text-xs font-medium text-white/55">
                        {activeItem.type === "intermission"
                          ? (activeItem.programNote ?? "Intermission")
                          : `${activeItem.teacher ?? "Teacher not listed"}${activeItem.songTitle ? ` · ${activeItem.songTitle}` : ""}`}
                      </p>
                    </div>
                    <div className="grid gap-1">
                      {audiencePreviewItems.slice(1).map((item, index) => (
                        <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-[4px] border border-white/8 bg-white/[0.03] px-2 py-1.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-white/10 text-[11px] font-bold text-white/70">
                            {getProgramItemNumber(item)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/70">
                            {index === 0 ? "Next: " : "Then: "}{item.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-white/60">
                    Audience app has no live item yet. Pick a show and set the first item on stage.
                  </p>
                )}
              </div>
            </div>

            {error ? (
              <p className="rounded-[6px] border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>
            ) : null}

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <button
                type="button"
                onClick={previousItem}
                disabled={!isSelectedShowActive || !currentItem || isSaving}
                className="flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-[6px] border border-white/10 px-1 text-xs font-bold text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:text-sm"
              >
                <ChevronLeft aria-hidden="true" className="size-5 shrink-0" />
                <span className="truncate">Back</span>
              </button>
              <button
                type="button"
                onClick={advanceItem}
                disabled={!selectedShow || isSaving}
                className="flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-[6px] bg-[#1C4EFF] px-1 text-xs font-bold text-white transition hover:bg-[#2d5cff] disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:text-sm"
              >
                <span className="truncate">Next</span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
              </button>
              <button
                type="button"
                onClick={resetLiveState}
                disabled={isSaving}
                className="flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-[6px] border border-white/10 px-1 text-xs font-bold text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:text-sm"
              >
                <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">Reset</span>
              </button>
            </div>
          </section>

          <section className="grid min-w-0 gap-2 rounded-[8px] border border-white/10 bg-white/5 p-2">
            <p className="px-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Active Show</p>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4">
              {program.shows.map((show) => {
                const isSelected = selectedShowId === show.id;
                const isActive = liveState.activeShowId === show.id;

                return (
                  <button
                    key={show.id}
                    type="button"
                    onClick={() => selectShow(show)}
                    className={`rounded-[6px] border p-3 text-left transition ${
                      isSelected
                        ? "border-[#1C4EFF] bg-[#0b1d3d] text-white"
                        : "border-white/10 bg-white/[0.03] text-white/72 hover:border-[#1C4EFF]"
                    }`}
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                      {show.day}
                    </span>
                    <span className="mt-1 block text-sm font-bold">{show.title}</span>
                    <span className="mt-0.5 block text-xs text-white/50">{show.startTime}</span>
                    {isActive ? (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#1C4EFF] px-2 py-1 text-[10px] font-bold text-white">
                        <CircleStop aria-hidden="true" className="size-3" />
                        Active
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid min-w-0 gap-2">
            <div className="flex min-w-0 items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Program Items</p>
                <h2 className="mt-1 break-words text-lg font-bold text-white">
                  {selectedShow.title} · {selectedShow.startTime}
                </h2>
              </div>
              <p className="shrink-0 text-sm font-medium text-white/45">{selectedShow.items.length} items</p>
            </div>

            <div className="grid min-w-0 gap-2">
              {selectedShow.items.map((item) => (
                <LiveItemRow
                  key={item.id}
                  item={item}
                  isCurrent={isSelectedShowActive && liveState.currentItemId === item.id}
                  onSetCurrent={() => setCurrentItem(item)}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
