"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  BLIND_RANK_ALLOWED_SLOT_COUNTS,
  BLIND_RANK_DEFAULT_SLOT_COUNT,
  BLIND_RANK_FORMATS,
  getBestBoardVoteSummary,
  getBlindRankActualOrder,
  getBlindRankFinalScore,
  getBlindRankRoundResponseCount,
  getBlindRankVoteSummary,
  getOpenSlots,
  getOpenSlotsForBoard,
  getSoloCompareBoard,
  getSoloCompareCurrentMovie,
  normalizeDisplayName,
  normalizeBlindRankFormat,
  normalizeRoomCode,
} from "@/lib/blind-rank";
import type { BlindRankBoardSlot, BlindRankFormat, BlindRankRoom } from "@/lib/blind-rank-types";

const PLAYER_NAME_STORAGE_KEY = "jose-games-blind-rank-name";
const PLAYER_SESSION_STORAGE_KEY = "jose-games-blind-rank-session";
const ROOM_POLL_INTERVAL_MS = 2000;

type BlindRankGameProps = {
  backendConfigured: boolean;
};

type ApiRoomResponse = {
  room?: BlindRankRoom;
  error?: string;
  success?: boolean;
};

export default function BlindRankGame({ backendConfigured }: BlindRankGameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room"));
  const joinAttemptedRoomCodeRef = useRef<string | null>(null);

  const [sessionId] = useState(() => getOrCreateBlindRankSessionId());
  const [displayName, setDisplayName] = useState(() => getStoredBlindRankName());
  const [room, setRoom] = useState<BlindRankRoom | null>(null);
  const [createTitle, setCreateTitle] = useState("Blind Rank");
  const [createSlotCount, setCreateSlotCount] = useState(BLIND_RANK_DEFAULT_SLOT_COUNT);
  const [createFormat, setCreateFormat] = useState<BlindRankFormat>("vote");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
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
    if (!backendConfigured || !roomCode || !sessionId) {
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
        const nextRoom = await fetchBlindRankRoom(roomCode);

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
  const slotCount = roomState?.slotCount ?? BLIND_RANK_DEFAULT_SLOT_COUNT;
  const roomFormat = normalizeBlindRankFormat(roomState?.format);
  const isSoloCompare = roomFormat === "solo-compare";
  const currentRound = roomState?.currentRound ?? null;
  const currentUser = roomState?.players.find((player) => player.sessionId === sessionId) ?? null;
  const isHost = currentUser?.isHost ?? false;
  const currentUserVote = currentRound?.votes.find((vote) => vote.sessionId === sessionId) ?? null;
  const currentUserSkipped = currentRound?.skippedSessionIds.includes(sessionId) ?? false;
  const votesBySessionId = new Map(currentRound?.votes.map((vote) => [vote.sessionId, vote]) ?? []);
  const skippedSessionIds = new Set(currentRound?.skippedSessionIds ?? []);
  const eligiblePlayers =
    roomState?.players.filter((player) =>
      currentRound?.eligibleSessionIds.includes(player.sessionId) ?? false,
    ) ?? [];
  const currentUserIsEligible = currentRound?.eligibleSessionIds.includes(sessionId) ?? false;
  const playersRemaining = eligiblePlayers.filter(
    (player) => !votesBySessionId.has(player.sessionId) && !skippedSessionIds.has(player.sessionId),
  );
  const openSlots = roomState ? getOpenSlots(roomState) : [];
  const voteSummary = currentRound ? getBlindRankVoteSummary(currentRound) : null;
  const responseCount = currentRound ? getBlindRankRoundResponseCount(currentRound) : 0;
  const finalScore = roomState ? getBlindRankFinalScore(roomState) : null;
  const actualOrder = roomState ? getBlindRankActualOrder(roomState) : [];
  const sharedActualOrder = isSoloCompare
    ? []
    : (actualOrder as Array<BlindRankBoardSlot & { movie: NonNullable<BlindRankBoardSlot["movie"]> }>);
  const soloActualOrder = isSoloCompare ? (actualOrder as NonNullable<ReturnType<typeof getSoloCompareCurrentMovie>>[]) : [];
  const currentChooser = currentRound?.chooserSessionId
    ? roomState?.players.find((player) => player.sessionId === currentRound.chooserSessionId) ?? null
    : null;
  const soloBoard = roomState ? getSoloCompareBoard(roomState, sessionId) : [];
  const soloCurrentMovie = roomState ? getSoloCompareCurrentMovie(roomState, sessionId) : null;
  const soloOpenSlots = getOpenSlotsForBoard(soloBoard);
  const soloHasBoard = Boolean(roomState?.soloBoards?.[sessionId]);
  const soloFinished = roomState?.soloFinishedSessionIds.includes(sessionId) ?? false;
  const soloFinishedCount = roomState?.soloFinishedSessionIds.length ?? 0;
  const currentBestBoardVote = roomState?.bestBoardVotes.find((vote) => vote.sessionId === sessionId) ?? null;
  const bestBoardVoteSummary = roomState ? getBestBoardVoteSummary(roomState) : null;
  const sortedPlayers = [...(roomState?.players ?? [])].sort((left, right) => {
    if (left.isHost !== right.isHost) {
      return left.isHost ? -1 : 1;
    }

    return Date.parse(left.joinedAt) - Date.parse(right.joinedAt);
  });
  const showLobby = !roomCode || !roomState || !activeRoom;

  async function handleCreateRoom() {
    try {
      setSubmitting(true);
      setStatusMessage(null);
      const nextDisplayName = normalizeDisplayName(displayName) || "Player 1";
      const nextRoom = await postRoomAction("/api/blind-rank/create", {
        title: createTitle,
        displayName: nextDisplayName,
        sessionId,
        slotCount: createSlotCount,
        format: createFormat,
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

  async function handleSaveName() {
    if (!roomCode) {
      return;
    }

    try {
      setSubmitting(true);
      setStatusMessage(null);
      const nextRoom = await joinRoomWithResolvedName(roomCode, sessionId, displayName, {
        onResolvedName: setDisplayName,
      });

      setRoom(nextRoom);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save display name.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStartGame() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/blind-rank/${roomCode}/start`, {
      sessionId,
    });
  }

  async function handleVote(slot: number) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/blind-rank/${roomCode}/vote`, {
      sessionId,
      slot,
    });
  }

  async function handleCloseVoting() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/blind-rank/${roomCode}/close`, {
      sessionId,
    });
  }

  async function handleSkipVote() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/blind-rank/${roomCode}/skip`, {
      sessionId,
    });
  }

  async function handleBreakTie(slot: number) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/blind-rank/${roomCode}/tiebreak`, {
      sessionId,
      slot,
    });
  }

  async function handleNextRound() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/blind-rank/${roomCode}/next-round`, {
      sessionId,
    });
  }

  async function handleVoteBestBoard(targetSessionId: string) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/blind-rank/${roomCode}/vote-best`, {
      sessionId,
      targetSessionId,
    });
  }

  async function handleCopyRoomLink() {
    if (!roomCode) {
      return;
    }

    try {
      const roomUrl = `${window.location.origin}${pathname}?room=${roomCode}`;
      await navigator.clipboard.writeText(roomUrl);
      setCopyStatus("Invite link copied.");
    } catch {
      setCopyStatus("Could not copy the invite link.");
    }
  }

  async function handleCloseRoom() {
    if (!roomCode) {
      return;
    }

    try {
      setSubmitting(true);
      setStatusMessage(null);
      await postAction(`/api/blind-rank/${roomCode}/close-room`, {
        sessionId,
      });
      setRoom(null);
      setError(null);
      setCopyStatus(null);
      setStatusMessage("Room closed.");
      clearRoomUrl();
      joinAttemptedRoomCodeRef.current = null;
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Could not close room.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runRoomMutation(url: string, body: Record<string, unknown>) {
    try {
      setSubmitting(true);
      setStatusMessage(null);
      const nextRoom = await postRoomAction(url, body);
      setRoom(nextRoom);
      setError(null);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Could not update room.",
      );
    } finally {
      setSubmitting(false);
    }
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

  if (!backendConfigured) {
    return (
      <div className="rounded-[1.5rem] border border-cyan-400/18 bg-cyan-400/8 p-6 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">
          Backend Needed
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Blind rank rooms are ready, but the backend is not configured yet.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run the SQL in `supabase/blind-rank-schema.sql`.
        </p>
      </div>
    );
  }

  if (showLobby) {
    return (
      <div className="space-y-5">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">
            Quick Rules
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Build a top 5 or top 10 movie ranking with friends. Choose between live voting, taking turns, or everyone making their own list before voting on the best board.
          </p>
          {roomCode && !roomState && !error ? (
            <p className="mt-3 text-sm text-cyan-200/85">Joining room `{roomCode}`...</p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </p>
          ) : null}
          {statusMessage ? (
            <p className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              {statusMessage}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr_1fr]">
          <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
              Your Name
            </p>
            <label className="mt-4 block text-sm text-slate-300">
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Player 1"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            </label>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Leave this blank and the room will assign the next available `Player N` name.
            </p>
          </section>

          <section className="rounded-[1.5rem] border border-cyan-300/12 bg-cyan-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">
              Create Room
            </p>
            <label className="mt-4 block text-sm text-slate-300">
              Room title
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Blind Rank"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            </label>
            <div className="mt-4">
              <p className="text-sm text-slate-300">Board size</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {BLIND_RANK_ALLOWED_SLOT_COUNTS.map((value) => {
                  const isSelected = createSlotCount === value;

                  return (
                    <button
                      key={`slot-count-${value}`}
                      type="button"
                      onClick={() => setCreateSlotCount(value)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        isSelected
                          ? "border-cyan-300/45 bg-cyan-300/14 text-cyan-50"
                          : "border-white/10 bg-slate-950/50 text-slate-300 hover:border-cyan-200/35 hover:bg-cyan-300/8"
                      }`}
                    >
                      Top {value}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-300">Format</p>
              <div className="mt-2 space-y-2">
                {BLIND_RANK_FORMATS.map((format) => {
                  const isSelected = createFormat === format;

                  return (
                    <button
                      key={`format-${format}`}
                      type="button"
                      onClick={() => setCreateFormat(format)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-cyan-300/45 bg-cyan-300/14 text-cyan-50"
                          : "border-white/10 bg-slate-950/50 text-slate-300 hover:border-cyan-200/35 hover:bg-cyan-300/8"
                      }`}
                    >
                      <p className="text-sm font-semibold text-inherit">{formatBlindRankFormatLabel(format)}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatBlindRankFormatDescription(format)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={submitting}
              className="mt-4 w-full rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create Blind Rank Room
            </button>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
              Join Room
            </p>
            <label className="mt-4 block text-sm text-slate-300">
              Room code
              <input
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
                placeholder="ABC123"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base uppercase tracking-[0.24em] text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            </label>
            <button
              type="button"
              onClick={handleJoinRoom}
              disabled={submitting}
              className="mt-4 w-full rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Join Existing Room
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.7rem] border border-cyan-300/12 bg-[linear-gradient(180deg,rgba(34,211,238,0.16),rgba(15,23,42,0.72))] p-5 shadow-[0_25px_70px_rgba(0,0,0,0.35)] sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-100/80">
              Live Room
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              {roomState.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-cyan-50/85">
              Room code `{activeRoom.code}`. {formatBlindRankFormatLabel(roomFormat)}. Fill all {slotCount} slots without ever getting to move one later.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleCopyRoomLink}
              className="rounded-full border border-cyan-100/20 bg-cyan-100/10 px-4 py-2.5 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/35 hover:bg-cyan-100/14"
            >
              Copy Invite Link
            </button>
            {isHost ? (
              <button
                type="button"
                onClick={handleCloseRoom}
                disabled={submitting}
                className="rounded-full border border-rose-300/25 bg-rose-400/12 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-400/16 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close Room
              </button>
            ) : null}
          </div>
        </div>

        {copyStatus ? <p className="mt-3 text-sm text-cyan-50/80">{copyStatus}</p> : null}
        {statusMessage ? <p className="mt-3 text-sm text-cyan-50/80">{statusMessage}</p> : null}
        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </section>

      {isSoloCompare ? (
        <SoloCompareRoomView
          roomState={roomState}
          slotCount={slotCount}
          displayName={displayName}
          setDisplayName={setDisplayName}
          submitting={submitting}
          onSaveName={handleSaveName}
          onStartGame={handleStartGame}
          onPlaceMovie={handleVote}
          onVoteBestBoard={handleVoteBestBoard}
          sessionId={sessionId}
          isHost={isHost}
          soloBoard={soloBoard}
          soloOpenSlots={soloOpenSlots}
          soloCurrentMovie={soloCurrentMovie}
          soloHasBoard={soloHasBoard}
          soloFinished={soloFinished}
          soloFinishedCount={soloFinishedCount}
          currentBestBoardVote={currentBestBoardVote?.targetSessionId ?? null}
          bestBoardVoteSummary={bestBoardVoteSummary}
          actualOrder={soloActualOrder}
          sortedPlayers={sortedPlayers}
        />
      ) : (
        <SharedBlindRankRoomView
          roomState={roomState}
          slotCount={slotCount}
          roomFormat={roomFormat}
          displayName={displayName}
          setDisplayName={setDisplayName}
          submitting={submitting}
          onSaveName={handleSaveName}
          currentVoteSlot={currentUserVote?.slot ?? null}
          currentUserSkipped={currentUserSkipped}
          currentUserIsEligible={currentUserIsEligible}
          currentRound={currentRound}
          currentChooserName={currentChooser?.name ?? null}
          openSlots={openSlots}
          responseCount={responseCount}
          eligiblePlayersCount={eligiblePlayers.length}
          playersRemainingCount={playersRemaining.length}
          sortedPlayers={sortedPlayers}
          votesBySessionId={votesBySessionId}
          skippedSessionIds={skippedSessionIds}
          sessionId={sessionId}
          isHost={isHost}
          voteSummary={voteSummary}
          finalScore={finalScore}
          actualOrder={sharedActualOrder}
          onVote={handleVote}
          onSkipVote={handleSkipVote}
          onStartGame={handleStartGame}
          onCloseVoting={handleCloseVoting}
          onNextRound={handleNextRound}
          onBreakTie={handleBreakTie}
        />
      )}
    </div>
  );
}

function SharedBlindRankRoomView({
  roomState,
  slotCount,
  roomFormat,
  displayName,
  setDisplayName,
  submitting,
  onSaveName,
  currentVoteSlot,
  currentUserSkipped,
  currentUserIsEligible,
  currentRound,
  currentChooserName,
  openSlots,
  responseCount,
  eligiblePlayersCount,
  playersRemainingCount,
  sortedPlayers,
  votesBySessionId,
  skippedSessionIds,
  sessionId,
  isHost,
  voteSummary,
  finalScore,
  actualOrder,
  onVote,
  onSkipVote,
  onStartGame,
  onCloseVoting,
  onNextRound,
  onBreakTie,
}: {
  roomState: BlindRankRoom["state"];
  slotCount: number;
  roomFormat: BlindRankFormat;
  displayName: string;
  setDisplayName: (value: string) => void;
  submitting: boolean;
  onSaveName: () => void;
  currentVoteSlot: number | null;
  currentUserSkipped: boolean;
  currentUserIsEligible: boolean;
  currentRound: BlindRankRoom["state"]["currentRound"];
  currentChooserName: string | null;
  openSlots: number[];
  responseCount: number;
  eligiblePlayersCount: number;
  playersRemainingCount: number;
  sortedPlayers: BlindRankRoom["state"]["players"];
  votesBySessionId: Map<string, { slot: number }>;
  skippedSessionIds: Set<string>;
  sessionId: string;
  isHost: boolean;
  voteSummary: ReturnType<typeof getBlindRankVoteSummary> | null;
  finalScore: number | null;
  actualOrder: Array<BlindRankBoardSlot & { movie: NonNullable<BlindRankBoardSlot["movie"]> }>;
  onVote: (slot: number) => void;
  onSkipVote: () => void;
  onStartGame: () => void;
  onCloseVoting: () => void;
  onNextRound: () => void;
  onBreakTie: (slot: number) => void;
}) {
  const isVoteFormat = roomFormat === "vote";
  const isTurnsFormat = roomFormat === "turns";
  const currentUserCanAct =
    roomState.status === "live" &&
    currentRound?.status === "voting" &&
    (isVoteFormat ? currentUserIsEligible : currentRound?.chooserSessionId === sessionId);

  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.95fr]">
      <div className="space-y-4">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm text-slate-300">
              Your display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            </label>
            <button
              type="button"
              onClick={onSaveName}
              disabled={submitting}
              className="rounded-full border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Name
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <StatCard label="Status" value={formatRoomStatus(roomState.status)} />
            <StatCard label="Players" value={String(roomState.players.length)} />
            <StatCard label="Open Slots" value={String(openSlots.length)} />
            <StatCard
              label={isVoteFormat ? "Votes Left" : "Turn"}
              value={isVoteFormat ? String(playersRemainingCount) : currentChooserName ?? "-"}
            />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">Board</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Locked top {slotCount}</h3>
            </div>
            <p className="text-sm text-slate-400">Filled slots are permanent.</p>
          </div>

          <div className="mt-5 space-y-3">
            {roomState.board.map((boardSlot) => (
              <BoardSlotCard
                key={boardSlot.slot}
                boardSlot={boardSlot}
                currentVoteSlot={currentVoteSlot}
                canVote={Boolean(
                  roomState.status === "live" &&
                    currentRound?.status === "voting" &&
                    currentUserCanAct &&
                    boardSlot.movie === null &&
                    !submitting,
                )}
                onVote={onVote}
              />
            ))}
          </div>
        </div>

        {roomState.status === "finished" ? (
          <div className="rounded-[1.5rem] border border-cyan-300/12 bg-cyan-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">Final Result</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {finalScore === 0 ? "Perfect board." : `Final score: ${finalScore ?? "-"}`}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Lower is better. The score is the total slot distance between where each movie landed and where its real rating says it should have been inside this top {slotCount}.
            </p>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/45 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Your Final Board</p>
                <div className="mt-3 space-y-2">
                  {roomState.board.map((boardSlot) => (
                    <ResultRow
                      key={`final-${boardSlot.slot}`}
                      slot={boardSlot.slot}
                      title={formatBoardSlotTitle(boardSlot)}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/45 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Actual Rating Order</p>
                <div className="mt-3 space-y-2">
                  {actualOrder.map((entry, index) => (
                    <ResultRow
                      key={`actual-${entry.movie.id}`}
                      slot={index + 1}
                      title={`${entry.movie.name}${entry.movie.year ? ` (${entry.movie.year})` : ""}`}
                      detail={`${entry.movie.rating.toFixed(1)} stars`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">Players</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Room roster</h3>
            </div>
            <p className="text-sm text-slate-400">{roomState.players.length} connected</p>
          </div>

          <div className="mt-5 space-y-3">
            {sortedPlayers.map((player) => {
              const vote = votesBySessionId.get(player.sessionId);
              const skipped = skippedSessionIds.has(player.sessionId);
              const isChooser = currentRound?.chooserSessionId === player.sessionId;

              return (
                <div key={player.sessionId} className="rounded-[1.2rem] border border-white/8 bg-slate-950/45 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-white">{player.name}</p>
                        {player.isHost ? (
                          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">Host</span>
                        ) : null}
                        {player.sessionId === sessionId ? (
                          <span className="rounded-full border border-white/10 bg-white/7 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">You</span>
                        ) : null}
                        {isTurnsFormat && isChooser ? (
                          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">Current Turn</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {isVoteFormat
                          ? currentRound?.eligibleSessionIds.includes(player.sessionId)
                            ? "In this round"
                            : roomState.status === "setup"
                              ? "Waiting for game start"
                              : "Waiting for next round"
                          : isChooser
                            ? "Choosing this movie"
                            : roomState.status === "setup"
                              ? "Waiting for game start"
                              : "Waiting for their turn"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{isVoteFormat ? "Response" : "Action"}</p>
                      <p className="mt-1 text-xl font-semibold text-white">
                        {isVoteFormat ? (vote ? `#${vote.slot}` : skipped ? "Skip" : "-") : isChooser ? "Live" : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-cyan-300/12 bg-cyan-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">Current Movie</p>
          {roomState.status === "setup" || !currentRound ? (
            <>
              <h3 className="mt-2 text-2xl font-semibold text-white">Waiting to start</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Invite the room, then let the host start the first random movie.</p>
              {isHost ? (
                <button
                  type="button"
                  onClick={onStartGame}
                  disabled={submitting}
                  className="mt-5 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Start Game
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="mt-4 overflow-hidden rounded-[1.3rem] border border-white/8 bg-slate-950/45">
                {currentRound.movie.posterUrl ? (
                  <div className="mx-auto w-full max-w-xs">
                    <div className="relative aspect-[2/3] w-full bg-slate-900/70">
                      <Image src={currentRound.movie.posterUrl} alt={currentRound.movie.name} fill sizes="(max-width: 1280px) 100vw, 420px" className="object-contain" />
                    </div>
                  </div>
                ) : null}

                <div className="p-4 sm:p-5">
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-100/70">Round {currentRound.roundNumber}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{currentRound.movie.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{currentRound.movie.year ? `${currentRound.movie.year}` : "Year unknown"}</p>
                  <p className="mt-4 text-sm leading-6 text-slate-300">
                    {currentRound.status === "voting"
                      ? isVoteFormat
                        ? "Pick one open slot, or skip if you do not know the movie. Once the room locks a slot in, that spot is gone forever."
                        : `${currentChooserName ?? "The current player"} chooses the slot for this movie.`
                      : currentRound.status === "tie"
                        ? `Tie between ${formatTiedSlots(voteSummary?.tiedSlots ?? [])}. Host decides the final slot.`
                        : currentRound.status === "skipped"
                          ? "This movie was skipped. No slot was locked in."
                          : `Locked into slot #${currentRound.chosenSlot}. Actual rating: ${currentRound.movie.rating.toFixed(1)} stars.`}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[1.2rem] border border-white/8 bg-slate-950/45 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">{isVoteFormat ? "Voting" : "Turn"}</p>
                <p className="mt-2 text-sm text-slate-400">
                  {currentRound.status === "voting"
                    ? isVoteFormat
                      ? `${responseCount} of ${eligiblePlayersCount} players responded.`
                      : `${currentChooserName ?? "The current player"} is choosing right now.`
                    : currentRound.status === "tie"
                      ? "Voting is tied. Host decides the slot."
                      : currentRound.status === "skipped"
                        ? "The movie was skipped and the host can move on."
                        : "The slot is locked and the rating is now revealed."}
                </p>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {Array.from({ length: slotCount }, (_, index) => index + 1).map((slot) => {
                    const isOpen = openSlots.includes(slot);
                    const isSelected = currentVoteSlot === slot;
                    const canVote =
                      roomState.status === "live" &&
                      currentRound.status === "voting" &&
                      currentUserCanAct &&
                      isOpen &&
                      !submitting;

                    return (
                      <button
                        key={`vote-slot-${slot}`}
                        type="button"
                        onClick={() => onVote(slot)}
                        disabled={!canVote}
                        className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                          isSelected
                            ? "bg-cyan-300 text-cyan-950"
                            : isOpen
                              ? "border border-white/10 bg-white/8 text-white hover:border-cyan-200/40 hover:bg-cyan-300/12"
                              : "cursor-not-allowed border border-white/6 bg-slate-900/70 text-slate-600"
                        }`}
                      >
                        #{slot}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-sm text-slate-400">
                  {currentRound.status === "voting"
                    ? isVoteFormat
                      ? currentVoteSlot
                        ? `Your current vote is slot #${currentVoteSlot}.`
                        : currentUserSkipped
                          ? "You skipped this movie. You can still change to a slot vote before voting closes."
                          : currentUserIsEligible
                            ? "You can change your vote until the round closes."
                            : "You joined after this round started. You are in on the next movie."
                      : currentRound.chooserSessionId === sessionId
                        ? "It is your turn. Pick the best open slot or skip the movie."
                        : `${currentChooserName ?? "Another player"} is making this decision.`
                    : currentRound.status === "tie"
                      ? "Voting is tied. Host decides the slot."
                      : currentRound.status === "skipped"
                        ? "This movie was skipped by the room."
                        : "The slot is locked and the rating is now revealed."}
                </p>

                {currentRound.status === "voting" && currentUserCanAct ? (
                  <button
                    type="button"
                    onClick={onSkipVote}
                    disabled={submitting}
                    className={`mt-4 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      currentUserSkipped
                        ? "bg-white text-slate-950 hover:bg-slate-100"
                        : "border border-white/12 bg-white/8 text-white hover:border-white/20 hover:bg-white/12"
                    }`}
                  >
                    {currentUserSkipped ? "Skipped" : "Skip Movie"}
                  </button>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {isHost && isVoteFormat && currentRound.status === "voting" ? (
                  <button
                    type="button"
                    onClick={onCloseVoting}
                    disabled={submitting}
                    className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Close Voting
                  </button>
                ) : null}

                {isHost && ["revealed", "skipped"].includes(currentRound.status) && roomState.status === "live" ? (
                  <button
                    type="button"
                    onClick={onNextRound}
                    disabled={submitting}
                    className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next Movie
                  </button>
                ) : null}
              </div>

              {isHost && isVoteFormat && currentRound.status === "tie" ? (
                <div className="mt-5 rounded-[1.2rem] border border-amber-300/18 bg-amber-400/10 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-200/80">Host Tiebreak</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(voteSummary?.tiedSlots ?? []).map((slot) => (
                      <button
                        key={`tie-slot-${slot}`}
                        type="button"
                        onClick={() => onBreakTie(slot)}
                        disabled={submitting}
                        className="rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/16 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Pick #{slot}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SoloCompareRoomView({
  roomState,
  slotCount,
  displayName,
  setDisplayName,
  submitting,
  onSaveName,
  onStartGame,
  onPlaceMovie,
  onVoteBestBoard,
  sessionId,
  isHost,
  soloBoard,
  soloOpenSlots,
  soloCurrentMovie,
  soloHasBoard,
  soloFinished,
  soloFinishedCount,
  currentBestBoardVote,
  bestBoardVoteSummary,
  actualOrder,
  sortedPlayers,
}: {
  roomState: BlindRankRoom["state"];
  slotCount: number;
  displayName: string;
  setDisplayName: (value: string) => void;
  submitting: boolean;
  onSaveName: () => void;
  onStartGame: () => void;
  onPlaceMovie: (slot: number) => void;
  onVoteBestBoard: (targetSessionId: string) => void;
  sessionId: string;
  isHost: boolean;
  soloBoard: BlindRankBoardSlot[];
  soloOpenSlots: number[];
  soloCurrentMovie: ReturnType<typeof getSoloCompareCurrentMovie>;
  soloHasBoard: boolean;
  soloFinished: boolean;
  soloFinishedCount: number;
  currentBestBoardVote: string | null;
  bestBoardVoteSummary: ReturnType<typeof getBestBoardVoteSummary> | null;
  actualOrder: NonNullable<ReturnType<typeof getSoloCompareCurrentMovie>>[];
  sortedPlayers: BlindRankRoom["state"]["players"];
}) {
  const judging = roomState.soloPhase === "judging" || roomState.status === "finished";
  const canPlaceMovie =
    roomState.status === "live" &&
    roomState.soloPhase === "ranking" &&
    soloHasBoard &&
    !soloFinished &&
    Boolean(soloCurrentMovie) &&
    !submitting;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <div className="space-y-4">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm text-slate-300">
              Your display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            </label>
            <button
              type="button"
              onClick={onSaveName}
              disabled={submitting}
              className="rounded-full border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Name
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <StatCard label="Status" value={formatRoomStatus(roomState.status)} />
            <StatCard label="Players" value={String(roomState.players.length)} />
            <StatCard label="Finished" value={`${soloFinishedCount}/${Object.keys(roomState.soloBoards).length}`} />
            <StatCard label="Board" value={`Top ${slotCount}`} />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">Your Board</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Private blind rank</h3>
            </div>
            <p className="text-sm text-slate-400">Everyone gets the same movies.</p>
          </div>

          <div className="mt-5 space-y-3">
            {soloBoard.map((boardSlot) => (
              <BoardSlotCard
                key={`solo-${boardSlot.slot}`}
                boardSlot={boardSlot}
                currentVoteSlot={null}
                canVote={canPlaceMovie && soloOpenSlots.includes(boardSlot.slot)}
                onVote={onPlaceMovie}
              />
            ))}
          </div>
        </div>

        {judging ? (
          <div className="rounded-[1.5rem] border border-cyan-300/12 bg-cyan-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">All Boards</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Vote for the best list</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">Everybody ranked the same {slotCount} movies. Pick the player whose list you think is strongest.</p>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {sortedPlayers
                .filter((player) => roomState.soloBoards[player.sessionId])
                .map((player) => {
                  const voteCount = bestBoardVoteSummary?.counts[player.sessionId] ?? 0;

                  return (
                    <div key={`judge-${player.sessionId}`} className="rounded-[1.2rem] border border-white/8 bg-slate-950/45 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-white">{player.name}</p>
                          <p className="mt-1 text-sm text-slate-400">{voteCount} vote{voteCount === 1 ? "" : "s"}</p>
                        </div>
                        {bestBoardVoteSummary?.leadingTargetSessionId === player.sessionId && voteCount > 0 ? (
                          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">Leading</span>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-2">
                        {roomState.soloBoards[player.sessionId]?.map((boardSlot) => (
                          <ResultRow
                            key={`solo-final-${player.sessionId}-${boardSlot.slot}`}
                            slot={boardSlot.slot}
                            title={formatBoardSlotTitle(boardSlot)}
                          />
                        ))}
                      </div>

                      {player.sessionId !== sessionId ? (
                        <button
                          type="button"
                          onClick={() => onVoteBestBoard(player.sessionId)}
                          disabled={submitting}
                          className={`mt-4 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            currentBestBoardVote === player.sessionId
                              ? "bg-cyan-300 text-cyan-950 hover:bg-cyan-200"
                              : "border border-white/12 bg-white/8 text-white hover:border-white/20 hover:bg-white/12"
                          }`}
                        >
                          {currentBestBoardVote === player.sessionId ? "Your Vote" : "Vote For This List"}
                        </button>
                      ) : (
                        <p className="mt-4 text-sm text-slate-500">You cannot vote for your own board.</p>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="mt-5 rounded-[1.2rem] border border-white/8 bg-slate-950/45 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Actual Rating Order</p>
              <div className="mt-3 space-y-2">
                {actualOrder.map((entry, index) => (
                  <ResultRow
                    key={`solo-actual-${entry.id}`}
                    slot={index + 1}
                    title={`${entry.name}${entry.year ? ` (${entry.year})` : ""}`}
                    detail={`${entry.rating.toFixed(1)} stars`}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">Players</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Room roster</h3>
            </div>
            <p className="text-sm text-slate-400">{roomState.players.length} connected</p>
          </div>

          <div className="mt-5 space-y-3">
            {sortedPlayers.map((player) => {
              const hasBoard = Boolean(roomState.soloBoards[player.sessionId]);
              const finished = roomState.soloFinishedSessionIds.includes(player.sessionId);
              const voteCount = bestBoardVoteSummary?.counts[player.sessionId] ?? 0;

              return (
                <div key={`solo-player-${player.sessionId}`} className="rounded-[1.2rem] border border-white/8 bg-slate-950/45 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-white">{player.name}</p>
                        {player.isHost ? (
                          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">Host</span>
                        ) : null}
                        {player.sessionId === sessionId ? (
                          <span className="rounded-full border border-white/10 bg-white/7 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">You</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {!hasBoard
                          ? roomState.status === "setup"
                            ? "Waiting for game start"
                            : "Watching this round"
                          : roomState.soloPhase === "ranking"
                            ? finished
                              ? "Finished ranking"
                              : "Still ranking"
                            : `${voteCount} vote${voteCount === 1 ? "" : "s"}`}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{roomState.soloPhase === "ranking" ? "Board" : "Votes"}</p>
                      <p className="mt-1 text-xl font-semibold text-white">
                        {roomState.soloPhase === "ranking"
                          ? finished
                            ? "Done"
                            : hasBoard
                              ? `${roomState.soloNextMovieIndexBySessionId[player.sessionId] ?? 0}/${slotCount}`
                              : "-"
                          : voteCount}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-cyan-300/12 bg-cyan-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">Current Movie</p>
          {roomState.status === "setup" ? (
            <>
              <h3 className="mt-2 text-2xl font-semibold text-white">Waiting to start</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Everyone will get the same {slotCount} movies, build their own blind rank, then vote on the best board.</p>
              {isHost ? (
                <button
                  type="button"
                  onClick={onStartGame}
                  disabled={submitting}
                  className="mt-5 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Start Game
                </button>
              ) : null}
            </>
          ) : roomState.soloPhase === "ranking" ? (
            <>
              {soloCurrentMovie ? (
                <div className="mt-4 overflow-hidden rounded-[1.3rem] border border-white/8 bg-slate-950/45">
                  {soloCurrentMovie.posterUrl ? (
                    <div className="mx-auto w-full max-w-xs">
                      <div className="relative aspect-[2/3] w-full bg-slate-900/70">
                        <Image src={soloCurrentMovie.posterUrl} alt={soloCurrentMovie.name} fill sizes="(max-width: 1280px) 100vw, 420px" className="object-contain" />
                      </div>
                    </div>
                  ) : null}

                  <div className="p-4 sm:p-5">
                    <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-100/70">Your next movie</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">{soloCurrentMovie.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{soloCurrentMovie.year ? `${soloCurrentMovie.year}` : "Year unknown"}</p>
                    <p className="mt-4 text-sm leading-6 text-slate-300">Place this movie into one open slot on your private board. Everyone is ranking the exact same lineup.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[1.2rem] border border-white/8 bg-slate-950/45 p-4">
                  <h3 className="text-2xl font-semibold text-white">Board complete</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Your list is locked in. Wait for everyone else to finish so the room can vote on the best board.</p>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 rounded-[1.2rem] border border-white/8 bg-slate-950/45 p-4">
              <h3 className="text-2xl font-semibold text-white">Judging open</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Every board is now revealed. Vote for the player whose blind rank you think is best.</p>
              {currentBestBoardVote ? <p className="mt-3 text-sm text-cyan-100">Your vote is in. You can still change it until everyone has voted.</p> : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/45 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function BoardSlotCard({
  boardSlot,
  currentVoteSlot,
  canVote,
  onVote,
}: {
  boardSlot: BlindRankBoardSlot;
  currentVoteSlot: number | null;
  canVote: boolean;
  onVote: (slot: number) => void;
}) {
  if (boardSlot.movie) {
    return (
      <div className="flex items-center gap-4 rounded-[1.25rem] border border-cyan-300/18 bg-cyan-300/8 p-3">
        <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-[1rem] border border-white/10 bg-slate-900/70">
          {boardSlot.movie.posterUrl ? (
            <Image
              src={boardSlot.movie.posterUrl}
              alt={`${boardSlot.movie.name} poster`}
              fill
              sizes="64px"
              className="object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              No Poster
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/80">
            #{boardSlot.slot}
          </p>
          <p className="mt-2 truncate text-base font-semibold text-white">
            {boardSlot.movie.name}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {boardSlot.movie.year ? `${boardSlot.movie.year}` : "Year unknown"}
          </p>
        </div>
      </div>
    );
  }

  const isSelected = currentVoteSlot === boardSlot.slot;

  return (
    <button
      type="button"
      onClick={() => onVote(boardSlot.slot)}
      disabled={!canVote}
      className={`flex w-full items-center gap-4 rounded-[1.25rem] border p-3 text-left transition ${
        isSelected
          ? "border-cyan-300/35 bg-cyan-300/14"
          : canVote
            ? "border-white/10 bg-slate-950/45 hover:border-cyan-200/35 hover:bg-cyan-300/8"
            : "border-white/6 bg-slate-950/30 text-slate-500"
      }`}
    >
      <div className="flex aspect-[2/3] w-16 shrink-0 items-center justify-center rounded-[1rem] border border-white/8 bg-slate-900/60">
        <p className="text-lg font-semibold text-slate-300">#{boardSlot.slot}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">
          #{boardSlot.slot}
        </p>
        <p className="mt-2 text-base font-semibold text-white">Empty slot</p>
        <p className="mt-1 text-sm text-slate-400">
          {isSelected ? "Your current vote" : canVote ? "Tap to vote here" : "Waiting to be filled"}
        </p>
      </div>
    </button>
  );
}

function ResultRow({
  slot,
  title,
  detail,
}: {
  slot: number;
  title: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/45 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-white">#{slot}</p>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-sm text-slate-200">{title}</p>
          {detail ? <p className="mt-0.5 text-xs text-slate-500">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
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
    const room = await fetchBlindRankRoom(roomCode);
    resolvedDisplayName = getNextDefaultPlayerName(room);
    options?.onResolvedName?.(resolvedDisplayName);
  }

  return postRoomAction("/api/blind-rank/join", {
    code: roomCode,
    displayName: resolvedDisplayName,
    sessionId,
  });
}

async function fetchBlindRankRoom(roomCode: string) {
  const response = await fetch(`/api/blind-rank/${roomCode}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as ApiRoomResponse;

  if (!response.ok || !payload.room) {
    throw new Error(payload.error ?? "Could not load room.");
  }

  return payload.room;
}

function getNextDefaultPlayerName(room: BlindRankRoom) {
  const takenNames = new Set(room.state.players.map((player) => player.name.trim().toLowerCase()));
  let playerNumber = 1;

  while (takenNames.has(`player ${playerNumber}`)) {
    playerNumber += 1;
  }

  return `Player ${playerNumber}`;
}

function getStoredBlindRankName() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "";
}

function getOrCreateBlindRankSessionId() {
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
      : `blind-rank-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}

function formatBlindRankFormatLabel(format: BlindRankFormat) {
  if (format === "turns") {
    return "Take Turns";
  }

  if (format === "solo-compare") {
    return "Solo Compare";
  }

  return "Vote Together";
}

function formatBlindRankFormatDescription(format: BlindRankFormat) {
  if (format === "turns") {
    return "Players rotate turns and the active player chooses the slot.";
  }

  if (format === "solo-compare") {
    return "Everyone ranks the same movies privately, then votes on the best list.";
  }

  return "Everyone votes on each movie and the room locks in the winning slot.";
}

function formatRoomStatus(status: BlindRankRoom["state"]["status"]) {
  if (status === "setup") {
    return "Setup";
  }

  if (status === "finished") {
    return "Finished";
  }

  return "Live";
}

function formatTiedSlots(slots: number[]) {
  return slots.map((slot) => `#${slot}`).join(", ");
}

function formatBoardSlotTitle(boardSlot: BlindRankBoardSlot) {
  if (!boardSlot.movie) {
    return "Empty";
  }

  return `${boardSlot.movie.name}${boardSlot.movie.year ? ` (${boardSlot.movie.year})` : ""}`;
}
