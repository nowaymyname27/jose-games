"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import GuessWhoCard from "@/components/guess-who-card";
import GuessWhoControls from "@/components/guess-who-controls";
import {
  buildGuessWhoBoard,
  createRandomSeed,
  getDefaultBoardSize,
  getBoardSizeOptions,
  isGuessWhoCategory,
  parseBoardSize,
} from "@/lib/guess-who";
import type { GuessWhoCatalog, GuessWhoCategory } from "@/lib/guess-who-types";
import { normalizeSeed } from "@/lib/seeded-random";

type GuessWhoGameProps = {
  catalog: GuessWhoCatalog;
};

type GuessWhoLocalState = {
  boardKey: string;
  draftCategoryId: GuessWhoCategory["id"];
  draftSize: number;
  draftSeed: string;
  eliminatedIds: string[];
  selectedId: string | null;
  copyStatus: string | null;
};

function createGuessWhoLocalState(
  boardKey: string,
  categoryId: GuessWhoCategory["id"],
  boardSize: number,
  boardSeed: string,
): GuessWhoLocalState {
  return {
    boardKey,
    draftCategoryId: categoryId,
    draftSize: boardSize,
    draftSeed: boardSeed,
    eliminatedIds: [],
    selectedId: null,
    copyStatus: null,
  };
}

export default function GuessWhoGame({ catalog }: GuessWhoGameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedCategory = searchParams.get("category");
  const categoryId: GuessWhoCategory["id"] = isGuessWhoCategory(requestedCategory, catalog.categories)
    ? requestedCategory
    : catalog.defaultCategoryId;
  const category =
    catalog.categories.find((entry) => entry.id === categoryId) ?? catalog.categories[0];
  const categoryEntries = useMemo(
    () => (category ? catalog.entriesByCategory[category.id] ?? [] : []),
    [catalog.entriesByCategory, category],
  );
  const sizeOptions = getBoardSizeOptions(categoryEntries.length);
  const activeSize = parseBoardSize(searchParams.get("size"), categoryEntries.length);
  const activeSeed = normalizeSeed(searchParams.get("seed"));
  const board = useMemo(
    () => buildGuessWhoBoard(category.id, categoryEntries, activeSeed, activeSize),
    [activeSeed, activeSize, category.id, categoryEntries],
  );
  const boardKey = `${category.id}:${board.size}:${board.seed}`;
  const fallbackLocalState = createGuessWhoLocalState(
    boardKey,
    category.id,
    board.size,
    board.seed,
  );
  const [localState, setLocalState] = useState<GuessWhoLocalState>(fallbackLocalState);
  const activeLocalState =
    localState.boardKey === boardKey ? localState : fallbackLocalState;

  useEffect(() => {
    if (categoryEntries.length === 0 || searchParams.get("seed")) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("category", catalog.defaultCategoryId);
    params.set("size", String(getDefaultBoardSize(categoryEntries.length)));
    params.set("seed", createRandomSeed());
    router.replace(`${pathname}?${params.toString()}`);
  }, [catalog.defaultCategoryId, category.id, categoryEntries.length, pathname, router, searchParams]);

  function updateBoardParams(nextCategoryId: GuessWhoCategory["id"], nextSize: number, nextSeed: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("category", nextCategoryId);
    params.set("size", String(nextSize));
    params.set("seed", normalizeSeed(nextSeed));
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleCopyLink() {
    const shareUrl = `${window.location.origin}${pathname}?category=${category.id}&size=${board.size}&seed=${board.seed}`;

    void navigator.clipboard.writeText(shareUrl).then(() => {
      setLocalState((currentState) => ({
        ...resolveLocalState(currentState, fallbackLocalState),
        copyStatus: "Share link copied.",
      }));
    });
  }

  function handleToggleEliminated(entryId: string) {
    setLocalState((currentState) => {
      const resolvedState = resolveLocalState(currentState, fallbackLocalState);
      const isEliminated = resolvedState.eliminatedIds.includes(entryId);

      return {
        ...resolvedState,
        eliminatedIds: isEliminated
          ? resolvedState.eliminatedIds.filter((id) => id !== entryId)
          : [...resolvedState.eliminatedIds, entryId],
      };
    });
  }

  function handleToggleSelected(entryId: string) {
    setLocalState((currentState) => {
      const resolvedState = resolveLocalState(currentState, fallbackLocalState);

      return {
        ...resolvedState,
        selectedId: resolvedState.selectedId === entryId ? null : entryId,
      };
    });
  }

  function handleRandomPick() {
    if (board.entries.length === 0) {
      return;
    }

    const randomEntry = board.entries[Math.floor(Math.random() * board.entries.length)];
    setLocalState((currentState) => ({
      ...resolveLocalState(currentState, fallbackLocalState),
      selectedId: randomEntry.id,
    }));
  }

  const activeCount = board.entries.length - activeLocalState.eliminatedIds.length;
  const selectedEntry =
    board.entries.find((entry) => entry.id === activeLocalState.selectedId) ?? null;

  if (categoryEntries.length < 2) {
    return (
      <div className="space-y-6">
        <div className="rounded-[1.1rem] border border-red-950/70 bg-[#18090b] p-6 text-center sm:p-8">
          <p className="text-lg font-medium text-red-100">
            Add entries to the selected category JSON inside `public/data/guess-who/` to build the board.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          <span className="rounded-full border border-red-950/60 bg-[#12080a] px-3 py-1.5 text-slate-300">
            Seed: {board.seed}
          </span>
          <span className="rounded-full border border-red-950/60 bg-[#12080a] px-3 py-1.5 text-slate-300">
            {board.size} Drivers
          </span>
        </div>
      </div>

      <GuessWhoControls
        categoryOptions={catalog.categories}
        draftCategoryId={activeLocalState.draftCategoryId}
        sizeOptions={sizeOptions}
        draftSize={activeLocalState.draftSize}
        draftSeed={activeLocalState.draftSeed}
        onDraftCategoryChange={(nextCategoryId) => {
          setLocalState((currentState) => ({
            ...resolveLocalState(currentState, fallbackLocalState),
            draftCategoryId: nextCategoryId,
          }));
        }}
        onDraftSizeChange={(nextSize) => {
          setLocalState((currentState) => ({
            ...resolveLocalState(currentState, fallbackLocalState),
            draftSize: nextSize,
          }));
        }}
        onDraftSeedChange={(nextSeed) => {
          setLocalState((currentState) => ({
            ...resolveLocalState(currentState, fallbackLocalState),
            draftSeed: nextSeed,
          }));
        }}
        onRandomizeSeed={() => {
          setLocalState((currentState) => ({
            ...resolveLocalState(currentState, fallbackLocalState),
            draftSeed: createRandomSeed(),
          }));
        }}
        onLoadBoard={() =>
          updateBoardParams(
            activeLocalState.draftCategoryId,
            activeLocalState.draftSize,
            activeLocalState.draftSeed,
          )
        }
        onCopyLink={handleCopyLink}
        copyStatus={activeLocalState.copyStatus}
      />

      <div className="mx-auto w-full max-w-[280px] rounded-[1.1rem] border border-red-950/70 bg-[#12080a] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:max-w-[320px] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
              Your Character
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">
              {selectedEntry ? selectedEntry.name : "No character selected"}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleRandomPick}
            className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
          >
            Random Pick
          </button>
        </div>

        <div className="overflow-hidden rounded-[1rem] border border-white/8 bg-slate-950/40">
          <div className="relative aspect-[7/8] w-full bg-slate-900/70">
            {selectedEntry?.imageUrl ? (
              <Image
                src={selectedEntry.imageUrl}
                alt={selectedEntry.name}
                fill
                sizes="(max-width: 767px) 280px, 320px"
                className="object-cover"
              />
            ) : selectedEntry ? (
              <div className="flex h-full items-center justify-center bg-linear-to-br from-[#13080a] via-[#1d0b0f] to-[#12080a] px-4 text-center">
                <div>
                  <p className="text-4xl font-semibold tracking-[0.2em] text-slate-100">
                    {selectedEntry.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 3)
                      .toUpperCase()}
                  </p>
                  <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                    Add Character Image
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center bg-linear-to-br from-[#13080a] via-[#1d0b0f] to-[#12080a] px-6 text-center">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                    Secret Pick Empty
                  </p>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-slate-300">
                    Use `Random Pick` to let the game choose for you, or tap `Pick` on any tile.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/8 px-3 py-3 sm:px-4">
            <div>
              <p className="text-sm font-semibold text-white">
                {selectedEntry ? selectedEntry.name : "Waiting for selection"}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                {selectedEntry ? "Private character for the round" : "Choose one manually or randomize"}
              </p>
            </div>

                {selectedEntry ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLocalState((currentState) => ({
                        ...resolveLocalState(currentState, fallbackLocalState),
                        selectedId: null,
                      }));
                    }}
                    className="rounded-full border border-red-900/60 bg-[#190b0d] px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-red-700/70 hover:bg-[#241012]"
                  >
                    Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-[1.1rem] border border-red-950/70 bg-[#12080a] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-3">
        <div className="mb-3 overflow-hidden rounded-[0.9rem] border border-red-950/70 bg-red-950/35">
          <div className="grid gap-px bg-red-950/40 lg:grid-cols-[160px_160px_minmax(260px,1fr)_auto]">
            <div className="bg-[#12080a] px-4 py-3.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
                Remaining
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">{activeCount}</p>
            </div>

            <div className="bg-[#12080a] px-4 py-3.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
                Crossed Off
              </p>
               <p className="mt-1 text-2xl font-semibold text-white">{activeLocalState.eliminatedIds.length}</p>
            </div>

            <div className="bg-[#12080a] px-4 py-3.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
                Secret Character
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">
                {selectedEntry ? selectedEntry.name : "Not picked yet"}
              </p>
            </div>

            <div className="flex items-center justify-start bg-[#12080a] px-4 py-3 sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setLocalState((currentState) => ({
                    ...resolveLocalState(currentState, fallbackLocalState),
                    eliminatedIds: [],
                    selectedId: null,
                  }));
                }}
                className="rounded-full border border-red-900/60 bg-[#190b0d] px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-red-700/70 hover:bg-[#241012]"
              >
                Reset Marks
              </button>
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-white/8 px-1 pb-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
              Board
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">Cross off characters as your questions narrow the board.</h2>
          </div>

          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Every player using this same seed sees the same tile order. Mark cards locally as the questions eliminate possibilities.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          {board.entries.map((entry) => (
            <GuessWhoCard
              key={entry.id}
              entry={entry}
              state={activeLocalState.eliminatedIds.includes(entry.id) ? "eliminated" : "active"}
              isSelected={activeLocalState.selectedId === entry.id}
              onToggleEliminated={() => handleToggleEliminated(entry.id)}
              onToggleSelected={() => handleToggleSelected(entry.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function resolveLocalState(
  currentState: GuessWhoLocalState,
  fallbackState: GuessWhoLocalState,
) {
  return currentState.boardKey === fallbackState.boardKey
    ? currentState
    : fallbackState;
}
