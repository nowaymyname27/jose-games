"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  getClueGiverResult,
  getCurrentViewerGuess,
  getRoundResults,
  getSpectrumPositionLabel,
  getSubmittedGuessCount,
  getWavelengthScoreboard,
  normalizeDisplayName,
  normalizeRoomCode,
} from "@/lib/wavelength";
import type { WavelengthRoom } from "@/lib/wavelength-types";

const PLAYER_NAME_STORAGE_KEY = "jose-games-wavelength-name";
const PLAYER_SESSION_STORAGE_KEY = "jose-games-wavelength-session";
const ROOM_POLL_INTERVAL_MS = 2000;

type WavelengthGameProps = {
  backendConfigured: boolean;
};

type ApiRoomResponse = {
  room?: WavelengthRoom;
  error?: string;
  success?: boolean;
};

export default function WavelengthGame({ backendConfigured }: WavelengthGameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room"));
  const joinAttemptedRoomCodeRef = useRef<string | null>(null);

  const [sessionId] = useState(() => getOrCreateWavelengthSessionId());
  const [displayName, setDisplayName] = useState(() => getStoredWavelengthName());
  const [room, setRoom] = useState<WavelengthRoom | null>(null);
  const [createTitle, setCreateTitle] = useState("Wavelength Room");
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
        const nextRoom = await fetchWavelengthRoom(roomCode, sessionId);

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
  }, [backendConfigured, roomCode, sessionId]);

  const activeRoom = room?.code === roomCode ? room : null;
  const roomState = activeRoom?.state ?? null;
  const currentRound = roomState?.currentRound ?? null;
  const currentUser = roomState?.players.find((player) => player.sessionId === sessionId) ?? null;
  const isHost = currentUser?.isHost ?? false;
  const isClueGiver = currentRound?.clueGiverSessionId === sessionId;
  const clueGiver = currentRound
    ? roomState?.players.find((player) => player.sessionId === currentRound.clueGiverSessionId) ?? null
    : null;
  const viewerGuess = currentRound ? getCurrentViewerGuess(currentRound, sessionId) : null;
  const readyForNextRoundSessionIds = currentRound?.readyForNextRoundSessionIds ?? [];
  const currentUserReadyForNextRound = readyForNextRoundSessionIds.includes(sessionId);
  const submittedGuessCount = currentRound ? getSubmittedGuessCount(currentRound) : 0;
  const eligibleGuessCount = currentRound?.eligibleSessionIds.length ?? 0;
  const showLobby = !roomCode || !roomState || !activeRoom;

  if (!backendConfigured) {
    return (
      <div className="rounded-[1.5rem] border border-fuchsia-400/18 bg-fuchsia-400/8 p-6 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-fuchsia-200/80">
          Backend Needed
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Wavelength rooms are ready, but the backend is not configured yet.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run the SQL in `supabase/wavelength-schema.sql`.
        </p>
      </div>
    );
  }

  if (showLobby) {
    return (
      <div className="space-y-5">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-fuchsia-200/80">
            Quick Rules
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            One player sees the hidden spot on the spectrum, gives a clue, and every other player privately guesses where it lands. Closest guesses score the most points.
          </p>
          {roomCode && !roomState && !error ? (
            <p className="mt-3 text-sm text-fuchsia-200/85">Joining room `{roomCode}`...</p>
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
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/40"
              />
            </label>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Leave this blank and the room will assign the next available `Player N` name.
            </p>
          </section>

          <section className="rounded-[1.5rem] border border-fuchsia-300/12 bg-fuchsia-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-fuchsia-200/80">
              Create Room
            </p>
            <label className="mt-4 block text-sm text-slate-300">
              Room title
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Wavelength Room"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/40"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleCreateRoom()}
              disabled={submitting}
              className="mt-5 rounded-full bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create Room
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
                onChange={(event) => setJoinCodeInput(event.target.value)}
                placeholder="ABC123"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base uppercase tracking-[0.18em] text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/40"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleJoinRoom()}
              disabled={submitting}
              className="mt-5 rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-5 py-3 text-sm font-semibold text-fuchsia-100 transition hover:border-fuchsia-200/35 hover:bg-fuchsia-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Join Room
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-fuchsia-200/80">
              Wavelength Room
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{roomState.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Room code `{activeRoom.code}`. Round {currentRound?.roundNumber ?? 0}. One clue-giver, private guesses, closest marker wins.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => void handleCopyRoomLink()}
              className="rounded-full bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-500"
            >
              Copy Invite
            </button>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/8"
            >
              Leave Room
            </button>
            {isHost ? (
              <button
                type="button"
                onClick={() => void handleCloseRoom()}
                disabled={submitting}
                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close Room
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <StatCard label="Status" value={roomState.status === "setup" ? "Setup" : currentRound?.phase ?? "Live"} />
          <StatCard label="Players" value={String(roomState.players.length)} />
          <StatCard label="Clue-Giver" value={clueGiver?.name ?? "Waiting"} />
          <StatCard label="Submitted" value={currentRound ? `${submittedGuessCount}/${eligibleGuessCount}` : "0/0"} />
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-[1rem] border border-white/8 bg-slate-950/35 p-4 md:flex-row md:items-end">
          <label className="block flex-1 text-sm text-slate-300">
            Display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Player 1"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/40"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSaveName()}
            disabled={submitting}
            className="rounded-full bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Name
          </button>
        </div>

        {copyStatus ? <p className="mt-3 text-sm text-fuchsia-100">{copyStatus}</p> : null}
        {error ? (
          <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </section>

      {roomState.status === "setup" || !currentRound ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
          <div className="order-1 xl:order-2">
            <ScoreboardCard room={activeRoom} sessionId={sessionId} />
          </div>

          <section className="order-2 rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6 xl:order-1">
            <SetupPanel
              isHost={isHost}
              playerCount={roomState.players.length}
              submitting={submitting}
              onStart={() => void handleStartRoom()}
            />
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <RoundPanel
              key={`${currentRound.roundNumber}-${currentRound.phase}`}
              room={activeRoom}
              isClueGiver={Boolean(isClueGiver)}
              submitting={submitting}
              viewerGuessPosition={viewerGuess?.position ?? null}
              currentUserReadyForNextRound={currentUserReadyForNextRound}
              onSelectSpectrum={(payload) => void handleSelectSpectrum(payload)}
              onSubmitClue={(value) => void handleSubmitClue(value)}
              onSubmitGuess={(value) => void handleSubmitGuess(value)}
              onToggleReadyForNextRound={() => void handleToggleReadyForNextRound()}
            />
          </section>

          <ScoreboardCard room={activeRoom} sessionId={sessionId} />
        </div>
      )}

      {currentRound?.phase === "revealed" ? (
        <RevealResultsCard room={activeRoom} />
      ) : null}
    </div>
  );

  async function handleCreateRoom() {
    try {
      setSubmitting(true);
      setStatusMessage(null);
      const nextDisplayName = normalizeDisplayName(displayName) || "Player 1";
      const nextRoom = await postRoomAction("/api/wavelength/create", {
        title: createTitle,
        displayName: nextDisplayName,
        sessionId,
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

  async function handleStartRoom() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/wavelength/${roomCode}/start`, { sessionId });
  }

  async function handleSubmitClue(clueText: string) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/wavelength/${roomCode}/clue`, {
      sessionId,
      clueText,
    });
  }

  async function handleSelectSpectrum(payload: {
    optionId: string;
    customLeftLabel?: string;
    customRightLabel?: string;
  }) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/wavelength/${roomCode}/select-spectrum`, {
      sessionId,
      optionId: payload.optionId,
      customLeftLabel: payload.customLeftLabel,
      customRightLabel: payload.customRightLabel,
    });
  }

  async function handleSubmitGuess(position: number) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/wavelength/${roomCode}/guess`, {
      sessionId,
      position,
    });
  }

  async function handleToggleReadyForNextRound() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/wavelength/${roomCode}/ready`, { sessionId });
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
      await postAction(`/api/wavelength/${roomCode}/close`, {
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
      setError(mutationError instanceof Error ? mutationError.message : "Could not update room.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLeaveRoom() {
    setRoom(null);
    setError(null);
    setCopyStatus(null);
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

function SetupPanel({
  isHost,
  playerCount,
  submitting,
  onStart,
}: {
  isHost: boolean;
  playerCount: number;
  submitting: boolean;
  onStart: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-fuchsia-200/80">
        Room Setup
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Gather everyone, then start the first spectrum.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
        Wavelength needs at least 2 players. Each round picks one random clue-giver and one random opposite pair. Everyone else submits a private guess.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <StatCard label="Players Ready" value={String(playerCount)} />
        <StatCard label="Can Start" value={playerCount >= 2 ? "Yes" : "Need More Players"} />
      </div>
      {isHost ? (
        <button
          type="button"
          onClick={onStart}
          disabled={submitting || playerCount < 2}
          className="mt-5 rounded-full bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Start Game
        </button>
      ) : (
        <p className="mt-5 text-sm text-slate-400">Waiting for the host to start the room.</p>
      )}
    </div>
  );
}

function RoundPanel({
  room,
  isClueGiver,
  submitting,
  viewerGuessPosition,
  currentUserReadyForNextRound,
  onSelectSpectrum,
  onSubmitClue,
  onSubmitGuess,
  onToggleReadyForNextRound,
}: {
  room: WavelengthRoom;
  isClueGiver: boolean;
  submitting: boolean;
  viewerGuessPosition: number | null;
  currentUserReadyForNextRound: boolean;
  onSelectSpectrum: (payload: {
    optionId: string;
    customLeftLabel?: string;
    customRightLabel?: string;
  }) => void;
  onSubmitClue: (value: string) => void;
  onSubmitGuess: (value: number) => void;
  onToggleReadyForNextRound: () => void;
}) {
  const round = room.state.currentRound;
  const [clueDraft, setClueDraft] = useState("");
  const [guessDraft, setGuessDraft] = useState(viewerGuessPosition ?? 50);
  const [customLeftDraft, setCustomLeftDraft] = useState("");
  const [customRightDraft, setCustomRightDraft] = useState("");

  if (!round) {
    return null;
  }

  const clueGiver = room.state.players.find((player) => player.sessionId === round.clueGiverSessionId) ?? null;
  const readyPlayers = room.state.players.filter((player) =>
    round.readyForNextRoundSessionIds.includes(player.sessionId),
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-fuchsia-200/80">
          Round {round.roundNumber}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          {round.spectrum
            ? <><span>{round.spectrum.leftLabel}</span> <span className="text-slate-500">to</span> <span>{round.spectrum.rightLabel}</span></>
            : "Choose The Spectrum"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {round.phase === "choosing-spectrum"
            ? `${clueGiver?.name ?? "Someone"} chooses which spectrum fits this hidden target best.`
            : `${clueGiver?.name ?? "Someone"} is the clue-giver this round.`}
        </p>
      </div>

      <SpectrumBar
        leftLabel={round.spectrum?.leftLabel ?? "Left Side"}
        rightLabel={round.spectrum?.rightLabel ?? "Right Side"}
        targetPosition={round.targetPosition}
        scoreZones={round.scoreZones}
        guessPosition={viewerGuessPosition ?? guessDraft}
        showTarget={Boolean(isClueGiver || round.phase === "revealed")}
        showScoreZones={Boolean(isClueGiver || round.phase === "revealed")}
        showGuess={Boolean(!isClueGiver && ["guessing", "revealed"].includes(round.phase))}
        interactiveGuess={round.phase === "guessing" && !isClueGiver}
        onGuessChange={setGuessDraft}
      />

      {round.phase === "choosing-spectrum" ? (
        isClueGiver ? (
          <div className="space-y-4 rounded-[1.15rem] border border-fuchsia-300/18 bg-fuchsia-400/8 p-4">
            <p className="text-sm text-fuchsia-100">
              Pick one of the two random spectrums, or write your own custom pair for this target.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {round.spectrumOptions
                .filter((option) => option.source === "preset")
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectSpectrum({ optionId: option.id })}
                    disabled={submitting}
                    className="rounded-[1rem] border border-white/10 bg-slate-950/60 px-4 py-4 text-left transition hover:border-fuchsia-300/35 hover:bg-slate-950/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Random Option</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {option.leftLabel} <span className="text-slate-500">to</span> {option.rightLabel}
                    </p>
                  </button>
                ))}
            </div>
            <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Custom Option</p>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <label className="block text-sm text-slate-300">
                  Left side
                  <input
                    value={customLeftDraft}
                    onChange={(event) => setCustomLeftDraft(event.target.value)}
                    placeholder="Messy"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/40"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Right side
                  <input
                    value={customRightDraft}
                    onChange={(event) => setCustomRightDraft(event.target.value)}
                    placeholder="Organized"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/40"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onSelectSpectrum({
                      optionId: "custom",
                      customLeftLabel: customLeftDraft,
                      customRightLabel: customRightDraft,
                    })
                  }
                  disabled={submitting}
                  className="rounded-full bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Use Custom
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/45 px-4 py-4 text-sm text-slate-300">
            Waiting for {clueGiver?.name ?? "the clue-giver"} to choose one of the spectrum options.
          </div>
        )
      ) : null}

      {round.clueText ? (
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/45 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
            Clue
          </p>
          <p className="mt-2 text-lg font-semibold text-white">{round.clueText}</p>
        </div>
      ) : null}

      {round.phase === "clue" ? (
        isClueGiver ? (
          <div className="rounded-[1.15rem] border border-fuchsia-300/18 bg-fuchsia-400/8 p-4">
            <p className="text-sm text-fuchsia-100">
              You can see the hidden target. Give a short clue that nudges everyone toward that exact spot.
            </p>
            <label className="mt-4 block text-sm text-slate-300">
              Clue
              <input
                value={clueDraft}
                onChange={(event) => setClueDraft(event.target.value)}
                placeholder="e.g. wedding cake"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/40"
              />
            </label>
            <button
              type="button"
              onClick={() => onSubmitClue(clueDraft)}
              disabled={submitting}
              className="mt-4 rounded-full bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Submit Clue
            </button>
          </div>
        ) : (
          <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/45 px-4 py-4 text-sm text-slate-300">
            Waiting for {clueGiver?.name ?? "the clue-giver"} to submit the clue.
          </div>
        )
      ) : null}

      {round.phase === "guessing" ? (
        isClueGiver ? (
          <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/45 px-4 py-4 text-sm text-slate-300">
            You&apos;re the clue-giver, so now you wait while everyone else locks in their guesses.
          </div>
        ) : (
          <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/45 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
                  Your Guess
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Move the slider, then lock in where you think the clue belongs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSubmitGuess(guessDraft)}
                disabled={submitting}
                className="rounded-full bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {viewerGuessPosition === null ? "Lock Guess" : "Update Guess"}
              </button>
            </div>
          </div>
        )
      ) : null}

      {round.phase === "revealed" ? (
        <div className="rounded-[1.15rem] border border-fuchsia-300/18 bg-fuchsia-400/8 p-4">
          <p className="text-sm text-fuchsia-100">
            The target is revealed at {round.targetPosition !== null ? getSpectrumPositionLabel(round.targetPosition) : "-"}. Check the results below, then everyone can toggle ready for the next round.
          </p>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {readyPlayers.length}/{room.state.players.length} ready for next round
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {readyPlayers.length > 0
                  ? `Ready: ${readyPlayers.map((player) => player.name).join(", ")}`
                  : "Nobody is ready yet."}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleReadyForNextRound}
              disabled={submitting}
              className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                currentUserReadyForNextRound
                  ? "bg-emerald-700 hover:bg-emerald-600"
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {currentUserReadyForNextRound ? "Ready For Next Round" : "Mark Ready For Next Round"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SpectrumBar({
  leftLabel,
  rightLabel,
  targetPosition,
  scoreZones,
  guessPosition,
  showTarget,
  showScoreZones,
  showGuess,
  interactiveGuess,
  onGuessChange,
}: {
  leftLabel: string;
  rightLabel: string;
  targetPosition: number | null;
  scoreZones: WavelengthRoom["state"]["currentRound"] extends infer Round
    ? Round extends { scoreZones: infer Zones }
      ? Zones
      : never
    : never;
  guessPosition: number;
  showTarget: boolean;
  showScoreZones: boolean;
  showGuess: boolean;
  interactiveGuess: boolean;
  onGuessChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-fuchsia-300/12 bg-fuchsia-500/5 p-4 sm:p-5">
      <div className="relative mx-auto w-full max-w-[720px]">
        <div className="relative rounded-[1.25rem] border border-fuchsia-300/20 bg-slate-950/55 px-5 py-6">
          <div className="relative h-14 overflow-hidden rounded-full border border-white/10 bg-linear-to-r from-[#301239] via-[#18101f] to-[#0f1f2f]">
            {showScoreZones
              ? [...scoreZones]
                  .sort((left, right) => left.points - right.points)
                  .map((zone) => (
                    <div
                      key={`${zone.points}-${zone.start}-${zone.end}`}
                      className={`absolute inset-y-0 rounded-full ${getScoreZoneClassName(zone.points)}`}
                      style={{
                        left: `${zone.start}%`,
                        width: `${Math.max(zone.end - zone.start, 0)}%`,
                      }}
                    />
                  ))
              : null}
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/14" />
            {showTarget && targetPosition !== null ? (
              <SpectrumMarker
                position={targetPosition}
                colorClass="bg-fuchsia-300"
                lineClassName="bg-fuchsia-300"
                label="Target"
              />
            ) : null}
            {showGuess ? (
              <SpectrumMarker
                position={guessPosition}
                colorClass="bg-emerald-300"
                lineClassName="bg-emerald-300"
                label="Guess"
              />
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-slate-300">
          <span>{leftLabel}</span>
          <span className="text-slate-500">Spectrum</span>
          <span>{rightLabel}</span>
        </div>
        {showScoreZones ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
            <ZoneLegend label="4 pts" className={getScoreZoneClassName(4)} />
            <ZoneLegend label="3 pts" className={getScoreZoneClassName(3)} />
            <ZoneLegend label="2 pts" className={getScoreZoneClassName(2)} />
            <ZoneLegend label="1 pt" className={getScoreZoneClassName(1)} />
          </div>
        ) : null}
        {interactiveGuess ? (
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={guessPosition}
            onChange={(event) => onGuessChange(Number(event.target.value))}
            className="mt-4 w-full accent-fuchsia-400"
          />
        ) : null}
      </div>
    </div>
  );
}

function SpectrumMarker({
  position,
  colorClass,
  lineClassName,
  label,
}: {
  position: number;
  colorClass: string;
  lineClassName: string;
  label: string;
}) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${position}%` }}
    >
      <span className="mb-2 rounded-full border border-white/10 bg-slate-950/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100">
        {label}
      </span>
      <div className={`h-14 w-1 rounded-full ${lineClassName}`} />
      <div className={`h-4 w-4 rounded-full border-2 border-slate-950 ${colorClass}`} />
    </div>
  );
}

function ZoneLegend({ label, className }: { label: string; className: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-slate-950 ${className}`}>
      {label}
    </span>
  );
}

function getScoreZoneClassName(points: 1 | 2 | 3 | 4) {
  if (points === 4) {
    return "bg-fuchsia-200/95";
  }

  if (points === 3) {
    return "bg-fuchsia-300/70";
  }

  if (points === 2) {
    return "bg-cyan-300/55";
  }

  return "bg-emerald-300/45";
}

function ScoreboardCard({ room, sessionId }: { room: WavelengthRoom; sessionId: string }) {
  const scoreboard = getWavelengthScoreboard(room.state);

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
        Scoreboard
      </p>
      <div className="mt-4 space-y-3">
        {scoreboard.map(({ player, score }) => (
          <div
            key={player.sessionId}
            className={`rounded-[1rem] border px-4 py-3 ${
              player.sessionId === sessionId
                ? "border-fuchsia-300/30 bg-fuchsia-400/10"
                : "border-white/8 bg-slate-950/35"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-white">{player.name}</p>
                {player.isHost ? (
                  <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-100">
                    Host
                  </span>
                ) : null}
                {player.sessionId === sessionId ? (
                  <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                    You
                  </span>
                ) : null}
              </div>
              <p className="text-2xl font-semibold text-white">{score}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RevealResultsCard({ room }: { room: WavelengthRoom }) {
  const round = room.state.currentRound;
  const results = getRoundResults(room.state);
  const clueGiverResult = getClueGiverResult(room.state);

  if (!round || round.phase !== "revealed") {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-fuchsia-300/12 bg-fuchsia-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-fuchsia-200/80">
        Round Results
      </p>
      {clueGiverResult ? (
        <div className="mt-4 rounded-[1rem] border border-fuchsia-300/18 bg-slate-950/35 px-4 py-4">
          <p className="text-sm text-slate-300">
            Clue-giver bonus: <span className="font-semibold text-white">+{clueGiverResult.points}</span>
            {" "}for {clueGiverResult.player.name} (median {clueGiverResult.medianScore} + 1, capped at 4)
          </p>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {results.map(({ guess, player, distance }) => (
          <div key={guess.sessionId} className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-4 py-3">
            <p className="text-base font-semibold text-white">{player.name}</p>
            <p className="mt-2 text-sm text-slate-300">
              Guess: {guess.position !== null ? getSpectrumPositionLabel(guess.position) : "-"}
            </p>
            <p className="mt-1 text-sm text-slate-300">Distance: {distance}</p>
            <p className="mt-3 text-2xl font-semibold text-white">+{guess.points ?? 0}</p>
          </div>
        ))}
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
    const room = await fetchWavelengthRoom(roomCode, sessionId);
    resolvedDisplayName = getNextDefaultPlayerName(room);
    options?.onResolvedName?.(resolvedDisplayName);
  }

  return postRoomAction("/api/wavelength/join", {
    code: roomCode,
    displayName: resolvedDisplayName,
    sessionId,
  });
}

async function fetchWavelengthRoom(roomCode: string, sessionId: string) {
  const response = await fetch(`/api/wavelength/${roomCode}?session=${encodeURIComponent(sessionId)}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as ApiRoomResponse;

  if (!response.ok || !payload.room) {
    throw new Error(payload.error ?? "Could not load room.");
  }

  return payload.room;
}

function getNextDefaultPlayerName(room: WavelengthRoom) {
  const takenNames = new Set(room.state.players.map((player) => player.name.trim().toLowerCase()));
  let playerNumber = 1;

  while (takenNames.has(`player ${playerNumber}`)) {
    playerNumber += 1;
  }

  return `Player ${playerNumber}`;
}

function getStoredWavelengthName() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "";
}

function getOrCreateWavelengthSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const storedSessionId = window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);

  if (storedSessionId) {
    return storedSessionId;
  }

  const nextSessionId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `wavelength-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}
