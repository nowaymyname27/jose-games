"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import GuessWhoCard from "@/components/guess-who-card";
import GuessWhoControls from "@/components/guess-who-controls";
import {
  buildGuessWhoBoard,
  createRandomSeed,
  getDefaultBoardSize,
  getBoardSizeOptions,
  isGuessWhoCategory,
  normalizeDisplayName,
  normalizeRoomCode,
  parseBoardSize,
} from "@/lib/guess-who";
import type {
  GuessWhoCatalog,
  GuessWhoCategory,
  GuessWhoRoom,
} from "@/lib/guess-who-types";
import { normalizeSeed } from "@/lib/seeded-random";

const PLAYER_NAME_STORAGE_KEY = "jose-games-guess-who-name";
const PLAYER_SESSION_STORAGE_KEY = "jose-games-guess-who-session";
const ROOM_POLL_INTERVAL_MS = 2000;

type GuessWhoGameProps = {
  catalog: GuessWhoCatalog;
  backendConfigured: boolean;
};

type ApiRoomResponse = {
  room?: GuessWhoRoom;
  error?: string;
  success?: boolean;
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

export default function GuessWhoGame({ catalog, backendConfigured }: GuessWhoGameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room"));
  const joinAttemptedRoomCodeRef = useRef<string | null>(null);

  const requestedCategory = searchParams.get("category");
  const localCategoryId: GuessWhoCategory["id"] = isGuessWhoCategory(requestedCategory, catalog.categories)
    ? requestedCategory
    : catalog.defaultCategoryId;

  const [sessionId] = useState(() => getOrCreateGuessWhoSessionId());
  const [displayName, setDisplayName] = useState(() => getStoredGuessWhoName());
  const [room, setRoom] = useState<GuessWhoRoom | null>(null);
  const [createTitle, setCreateTitle] = useState("Guess Who Room");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [roomCopyStatus, setRoomCopyStatus] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!displayName) {
      window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, displayName);
  }, [displayName]);

  useEffect(() => {
    if (!roomCode) {
      joinAttemptedRoomCodeRef.current = null;
      return;
    }

    if (!backendConfigured || !sessionId) {
      return;
    }

    if (joinAttemptedRoomCodeRef.current === roomCode) {
      return;
    }

    joinAttemptedRoomCodeRef.current = roomCode;

    void joinRoomWithResolvedName(roomCode, sessionId, displayName, {
      onResolvedName: setDisplayName,
    })
      .then((nextRoom) => {
        setRoom(nextRoom);
        setError(null);
      })
      .catch((joinError) => {
        setError(joinError instanceof Error ? joinError.message : "Could not join room.");
        joinAttemptedRoomCodeRef.current = null;
      });
  }, [backendConfigured, displayName, roomCode, sessionId]);

  useEffect(() => {
    if (!backendConfigured || !roomCode || !joinAttemptedRoomCodeRef.current) {
      return;
    }

    let cancelled = false;

    async function refreshRoom() {
      try {
        const nextRoom = await fetchGuessWhoRoom(roomCode);

        if (!cancelled) {
          setRoom(nextRoom);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not refresh room.");
        }
      }
    }

    void refreshRoom();
    const intervalId = window.setInterval(() => {
      void refreshRoom();
    }, ROOM_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [backendConfigured, roomCode]);

  const activeRoom = room?.code === roomCode ? room : null;
  const roomState = activeRoom?.state ?? null;
  const boardCategoryId = roomState?.categoryId ?? localCategoryId;
  const category =
    catalog.categories.find((entry) => entry.id === boardCategoryId) ?? catalog.categories[0];
  const categoryEntries = useMemo(
    () => (category ? catalog.entriesByCategory[category.id] ?? [] : []),
    [catalog.entriesByCategory, category],
  );
  const sizeOptions = getBoardSizeOptions(categoryEntries.length);
  const activeSize = roomState
    ? parseBoardSize(String(roomState.boardSize), categoryEntries.length)
    : parseBoardSize(searchParams.get("size"), categoryEntries.length);
  const activeSeed = roomState
    ? normalizeSeed(roomState.seed)
    : normalizeSeed(searchParams.get("seed"));
  const board = useMemo(
    () => buildGuessWhoBoard(category.id, categoryEntries, activeSeed, activeSize),
    [activeSeed, activeSize, category.id, categoryEntries],
  );
  const boardKeyPrefix = roomState && activeRoom ? `room:${activeRoom.code}:${sessionId}` : "local";
  const boardKey = `${boardKeyPrefix}:${category.id}:${board.size}:${board.seed}`;
  const fallbackLocalState = createGuessWhoLocalState(
    boardKey,
    category.id,
    board.size,
    board.seed,
  );
  const [localState, setLocalState] = useState<GuessWhoLocalState>(fallbackLocalState);
  const activeLocalState = localState.boardKey === boardKey ? localState : fallbackLocalState;
  const currentUser = roomState?.players.find((player) => player.sessionId === sessionId) ?? null;
  const isHost = currentUser?.isHost ?? false;
  const isSpectator = roomState ? currentUser?.role !== "player" : false;
  const canInteractWithBoard = !roomState || !isSpectator;
  const sortedPlayers = [...(roomState?.players ?? [])].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "player" ? -1 : 1;
    }

    if (left.seat !== right.seat) {
      return (left.seat ?? Number.MAX_SAFE_INTEGER) - (right.seat ?? Number.MAX_SAFE_INTEGER);
    }

    if (left.isHost !== right.isHost) {
      return left.isHost ? -1 : 1;
    }

    return Date.parse(left.joinedAt) - Date.parse(right.joinedAt);
  });
  const playerCount = sortedPlayers.filter((player) => player.role === "player").length;
  const spectatorCount = sortedPlayers.length - playerCount;
  const activeCount = board.entries.length - activeLocalState.eliminatedIds.length;
  const selectedEntry =
    board.entries.find((entry) => entry.id === activeLocalState.selectedId) ?? null;

  useEffect(() => {
    if (roomCode || categoryEntries.length === 0 || searchParams.get("seed")) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("category", catalog.defaultCategoryId);
    params.set("size", String(getDefaultBoardSize(categoryEntries.length)));
    params.set("seed", createRandomSeed());
    router.replace(`${pathname}?${params.toString()}`);
  }, [catalog.defaultCategoryId, categoryEntries.length, pathname, roomCode, router, searchParams]);

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
            {board.size} Characters
          </span>
          {roomState ? (
            <span className="rounded-full border border-red-950/60 bg-[#12080a] px-3 py-1.5 text-red-100">
              Room {activeRoom?.code ?? roomCode}
            </span>
          ) : null}
        </div>
      </div>

      {roomState && activeRoom ? (
        <RoomSummaryCard
          room={activeRoom}
          categoryLabel={category.label}
          currentUserName={currentUser?.name ?? displayName}
          isHost={isHost}
          isSpectator={isSpectator}
          playerCount={playerCount}
          spectatorCount={spectatorCount}
          copyStatus={roomCopyStatus}
          onCopyInvite={() => void handleCopyRoomLink()}
          onLeaveRoom={handleLeaveRoom}
          onCloseRoom={isHost ? () => void handleCloseRoom() : undefined}
          submitting={submitting}
        />
      ) : backendConfigured ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-red-200/80">
              Multiplayer Rooms
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Create a shared board for two players.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              The host locks in one category, one size, and one seed. The first two people to join become players. Everyone else can spectate.
            </p>
            {roomCode && !roomState && !error ? (
              <p className="mt-3 text-sm text-red-200/85">Joining room `{roomCode}`...</p>
            ) : null}
            {error ? (
              <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </p>
            ) : null}
            {statusMessage ? (
              <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {statusMessage}
              </p>
            ) : null}
          </section>

          <section className="rounded-[1.2rem] border border-red-950/60 bg-[#12080a] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
              Room Setup
            </p>
            <div className="mt-4 space-y-4">
              <label className="block text-sm text-slate-300">
                Display name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Player 1"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-red-400/40"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Room title
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  placeholder="Guess Who Room"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-red-400/40"
                />
              </label>

              <div className="rounded-[1rem] border border-red-950/60 bg-[#170a0c] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-red-200/80">
                  Board That Will Be Shared
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{category.label}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {board.size} characters, seed `{board.seed}`
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleCreateRoom()}
                  disabled={submitting}
                  className="rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Create Room
                </button>
                <input
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value)}
                  placeholder="Enter room code"
                  className="min-w-0 flex-1 rounded-full border border-red-950/60 bg-[#190b0d] px-4 py-3 text-sm font-medium uppercase tracking-[0.18em] text-white outline-none transition placeholder:text-slate-600 focus:border-red-500/60"
                />
                <button
                  type="button"
                  onClick={() => void handleJoinRoom()}
                  disabled={submitting}
                  className="rounded-full border border-red-900/60 bg-[#190b0d] px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-red-700/70 hover:bg-[#241012] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Join Room
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="rounded-[1.1rem] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Guess Who local mode is available now. Multiplayer rooms unlock after Supabase is configured.
        </div>
      )}

      {!roomState ? (
        <GuessWhoControls
          categoryOptions={catalog.categories}
          draftCategoryId={activeLocalState.draftCategoryId}
          sizeOptions={sizeOptions}
          draftSize={activeLocalState.draftSize}
          draftSeed={activeLocalState.draftSeed}
          onDraftCategoryChange={(nextCategoryId) => {
            const nextEntries = catalog.entriesByCategory[nextCategoryId] ?? [];
            const nextSize = parseBoardSize(String(activeLocalState.draftSize), nextEntries.length);

            setLocalState((currentState) => ({
              ...resolveLocalState(currentState, fallbackLocalState),
              draftCategoryId: nextCategoryId,
              draftSize: nextSize,
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
          onCopyLink={handleCopyLocalBoardLink}
          copyStatus={activeLocalState.copyStatus}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SecretPickCard
          selectedEntry={selectedEntry}
          canInteract={canInteractWithBoard}
          isSpectator={isSpectator}
          onRandomPick={handleRandomPick}
          onClearSelection={handleClearSelection}
        />

        {roomState ? (
          <PlayersCard players={sortedPlayers} sessionId={sessionId} />
        ) : (
          <LocalModeSummaryCard />
        )}
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
                {roomState ? (isSpectator ? "Room View" : "Your Secret Character") : "Secret Character"}
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">
                {isSpectator ? "Spectator board only" : selectedEntry ? selectedEntry.name : "Not picked yet"}
              </p>
            </div>

            <div className="flex items-center justify-start bg-[#12080a] px-4 py-3 sm:justify-end">
              {canInteractWithBoard ? (
                <button
                  type="button"
                  onClick={handleResetMarks}
                  className="rounded-full border border-red-900/60 bg-[#190b0d] px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-red-700/70 hover:bg-[#241012]"
                >
                  Reset Marks
                </button>
              ) : (
                <span className="text-sm text-slate-400">Read-only spectator board</span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-white/8 px-1 pb-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
              Board
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">
              {roomState
                ? "The room shares one board. Only active players can privately mark it on their own device."
                : "Cross off characters as your questions narrow the board."}
            </h2>
          </div>

          <p className="max-w-xl text-sm leading-6 text-slate-400">
            {roomState
              ? "Everyone sees the same tile order from the room seed. Secret picks and marks stay private for the two active players."
              : "Every player using this same seed sees the same tile order. Mark cards locally as the questions eliminate possibilities."}
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
              interactive={canInteractWithBoard}
            />
          ))}
        </div>
      </div>
    </div>
  );

  function updateBoardParams(nextCategoryId: GuessWhoCategory["id"], nextSize: number, nextSeed: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("category", nextCategoryId);
    params.set("size", String(nextSize));
    params.set("seed", normalizeSeed(nextSeed));
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleCopyLocalBoardLink() {
    const shareUrl = `${window.location.origin}${pathname}?category=${category.id}&size=${board.size}&seed=${board.seed}`;

    void navigator.clipboard.writeText(shareUrl).then(() => {
      setLocalState((currentState) => ({
        ...resolveLocalState(currentState, fallbackLocalState),
        copyStatus: "Share link copied.",
      }));
    });
  }

  function handleToggleEliminated(entryId: string) {
    if (!canInteractWithBoard) {
      return;
    }

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
    if (!canInteractWithBoard) {
      return;
    }

    setLocalState((currentState) => {
      const resolvedState = resolveLocalState(currentState, fallbackLocalState);

      return {
        ...resolvedState,
        selectedId: resolvedState.selectedId === entryId ? null : entryId,
      };
    });
  }

  function handleRandomPick() {
    if (!canInteractWithBoard || board.entries.length === 0) {
      return;
    }

    const randomEntry = board.entries[Math.floor(Math.random() * board.entries.length)];
    setLocalState((currentState) => ({
      ...resolveLocalState(currentState, fallbackLocalState),
      selectedId: randomEntry.id,
    }));
  }

  function handleClearSelection() {
    if (!canInteractWithBoard) {
      return;
    }

    setLocalState((currentState) => ({
      ...resolveLocalState(currentState, fallbackLocalState),
      selectedId: null,
    }));
  }

  function handleResetMarks() {
    if (!canInteractWithBoard) {
      return;
    }

    setLocalState((currentState) => ({
      ...resolveLocalState(currentState, fallbackLocalState),
      eliminatedIds: [],
      selectedId: null,
    }));
  }

  async function handleCreateRoom() {
    try {
      setSubmitting(true);
      setStatusMessage(null);
      setRoomCopyStatus(null);
      const nextDisplayName = normalizeDisplayName(displayName) || "Player 1";
      const nextRoom = await postRoomAction("/api/guess-who/create", {
        title: createTitle,
        displayName: nextDisplayName,
        sessionId,
        categoryId: activeLocalState.draftCategoryId,
        boardSize: activeLocalState.draftSize,
        seed: activeLocalState.draftSeed,
      });

      setDisplayName(nextDisplayName);
      setRoom(nextRoom);
      setJoinCodeInput("");
      setError(null);
      updateRoomUrl(nextRoom.code);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create room.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinRoom() {
    const nextRoomCode = normalizeRoomCode(joinCodeInput);

    if (!nextRoomCode) {
      setError("Enter a room code to join.");
      return;
    }

    try {
      setSubmitting(true);
      setStatusMessage(null);
      setRoomCopyStatus(null);
      const nextRoom = await joinRoomWithResolvedName(nextRoomCode, sessionId, displayName, {
        onResolvedName: setDisplayName,
      });

      setRoom(nextRoom);
      setJoinCodeInput("");
      setError(null);
      updateRoomUrl(nextRoom.code);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join room.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyRoomLink() {
    if (!roomCode) {
      return;
    }

    try {
      const roomUrl = `${window.location.origin}${pathname}?room=${roomCode}`;
      await navigator.clipboard.writeText(roomUrl);
      setRoomCopyStatus("Invite link copied.");
    } catch {
      setRoomCopyStatus("Could not copy the invite link.");
    }
  }

  async function handleCloseRoom() {
    if (!roomCode) {
      return;
    }

    try {
      setSubmitting(true);
      setStatusMessage(null);
      await postAction(`/api/guess-who/${roomCode}/close`, {
        sessionId,
      });
      setRoom(null);
      setError(null);
      setRoomCopyStatus(null);
      setStatusMessage("Room closed.");
      clearRoomUrl();
      joinAttemptedRoomCodeRef.current = null;
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Could not close room.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLeaveRoom() {
    setRoom(null);
    setError(null);
    setRoomCopyStatus(null);
    setStatusMessage("Left room.");
    clearRoomUrl();
    joinAttemptedRoomCodeRef.current = null;
  }

  function updateRoomUrl(nextRoomCode: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("room", nextRoomCode);
    joinAttemptedRoomCodeRef.current = nextRoomCode;
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearRoomUrl() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("room");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }
}

function RoomSummaryCard({
  room,
  categoryLabel,
  currentUserName,
  isHost,
  isSpectator,
  playerCount,
  spectatorCount,
  copyStatus,
  onCopyInvite,
  onLeaveRoom,
  onCloseRoom,
  submitting,
}: {
  room: GuessWhoRoom;
  categoryLabel: string;
  currentUserName: string;
  isHost: boolean;
  isSpectator: boolean;
  playerCount: number;
  spectatorCount: number;
  copyStatus: string | null;
  onCopyInvite: () => void;
  onLeaveRoom: () => void;
  onCloseRoom?: () => void;
  submitting: boolean;
}) {
  return (
    <section className="rounded-[1.2rem] border border-red-950/70 bg-[#12080a] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-red-200/80">
            Guess Who Room
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{room.state.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Room code `{room.code}`. {categoryLabel}. {room.state.boardSize} characters. Spectators can watch, but only the two seated players get private picks and local marks.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={onCopyInvite}
            className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
          >
            Copy Invite
          </button>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="rounded-full border border-red-900/60 bg-[#190b0d] px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-red-700/70 hover:bg-[#241012]"
          >
            Leave Room
          </button>
          {onCloseRoom ? (
            <button
              type="button"
              onClick={onCloseRoom}
              disabled={submitting}
              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Close Room
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <StatCard label="You Are" value={isSpectator ? "Spectator" : isHost ? "Host" : "Player"} />
        <StatCard label="Players" value={`${playerCount}/2`} />
        <StatCard label="Spectators" value={String(spectatorCount)} />
        <StatCard label="Name" value={currentUserName} />
      </div>

      {copyStatus ? <p className="mt-3 text-sm text-red-100">{copyStatus}</p> : null}
    </section>
  );
}

function SecretPickCard({
  selectedEntry,
  canInteract,
  isSpectator,
  onRandomPick,
  onClearSelection,
}: {
  selectedEntry: GuessWhoCatalog["entriesByCategory"][string][number] | null;
  canInteract: boolean;
  isSpectator: boolean;
  onRandomPick: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[1.1rem] border border-red-950/70 bg-[#12080a] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-4 xl:mx-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
            {isSpectator ? "Spectator View" : "Your Character"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">
            {isSpectator ? "Watching the shared board" : selectedEntry ? selectedEntry.name : "No character selected"}
          </h2>
        </div>

        {canInteract ? (
          <button
            type="button"
            onClick={onRandomPick}
            className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
          >
            Random Pick
          </button>
        ) : null}
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
                  {isSpectator ? "No Private Pick" : "Secret Pick Empty"}
                </p>
                <p className="mt-3 max-w-xs text-sm leading-6 text-slate-300">
                  {isSpectator
                    ? "Spectators do not get a private character. Watch the room and follow the board."
                    : "Use `Random Pick` to let the game choose for you, or tap `Pick` on any tile."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/8 px-3 py-3 sm:px-4">
          <div>
            <p className="text-sm font-semibold text-white">
              {isSpectator
                ? "Spectators cannot set a secret character"
                : selectedEntry
                  ? selectedEntry.name
                  : "Waiting for selection"}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
              {isSpectator
                ? "Shared board, no private actions"
                : selectedEntry
                  ? "Private character for the round"
                  : "Choose one manually or randomize"}
            </p>
          </div>

          {canInteract && selectedEntry ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-full border border-red-900/60 bg-[#190b0d] px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-red-700/70 hover:bg-[#241012]"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlayersCard({
  players,
  sessionId,
}: {
  players: GuessWhoRoom["state"]["players"];
  sessionId: string;
}) {
  return (
    <section className="rounded-[1.1rem] border border-red-950/70 bg-[#12080a] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
      <div className="flex items-end justify-between gap-3 border-b border-white/8 pb-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
            Room Roster
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">
            Two active players, everyone else spectates.
          </h2>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {players.map((player) => (
          <div
            key={player.sessionId}
            className={`rounded-[1rem] border px-4 py-3 ${
              player.sessionId === sessionId
                ? "border-red-400/30 bg-red-500/10"
                : "border-white/8 bg-slate-950/35"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-white">{player.name}</p>
              {player.isHost ? (
                <span className="rounded-full border border-red-300/20 bg-red-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-100">
                  Host
                </span>
              ) : null}
              {player.seat ? (
                <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                  Player {player.seat}
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Spectator
                </span>
              )}
              {player.sessionId === sessionId ? (
                <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  You
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-400">
              {player.role === "player"
                ? "Private marks and secret pick stay on this player’s device."
                : "Read-only spectator view of the shared board."}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LocalModeSummaryCard() {
  return (
    <section className="rounded-[1.1rem] border border-red-950/70 bg-[#12080a] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
        Local Mode
      </p>
      <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">
        Shared seed practice board
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
        Keep using the original seed link flow for casual local games, or create a room above when you want one host-controlled board with two players and spectator support.
      </p>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
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

async function postRoomAction(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiRoomResponse;

  if (!response.ok || !payload.room) {
    throw new Error(payload.error ?? "Could not update room.");
  }

  return payload.room;
}

async function postAction(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiRoomResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not complete action.");
  }
}

async function joinRoomWithResolvedName(
  roomCode: string,
  sessionId: string,
  preferredDisplayName: string,
  options?: {
    onResolvedName?: (name: string) => void;
  },
) {
  let resolvedDisplayName = normalizeDisplayName(preferredDisplayName);

  if (!resolvedDisplayName) {
    const room = await fetchGuessWhoRoom(roomCode);
    resolvedDisplayName = getNextDefaultPlayerName(room);
    options?.onResolvedName?.(resolvedDisplayName);
  }

  return postRoomAction("/api/guess-who/join", {
    code: roomCode,
    displayName: resolvedDisplayName,
    sessionId,
  });
}

async function fetchGuessWhoRoom(roomCode: string) {
  const response = await fetch(`/api/guess-who/${roomCode}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as ApiRoomResponse;

  if (!response.ok || !payload.room) {
    throw new Error(payload.error ?? "Could not load room.");
  }

  return payload.room;
}

function getNextDefaultPlayerName(room: GuessWhoRoom) {
  const takenNames = new Set(room.state.players.map((player) => player.name.trim().toLowerCase()));
  let playerNumber = 1;

  while (takenNames.has(`player ${playerNumber}`)) {
    playerNumber += 1;
  }

  return `Player ${playerNumber}`;
}

function getStoredGuessWhoName() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "";
}

function getOrCreateGuessWhoSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const storedSessionId = window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);

  if (storedSessionId) {
    return storedSessionId;
  }

  const nextSessionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guess-who-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}
