"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  normalizeDisplayName,
  normalizeRoomCode,
} from "@/lib/d20";
import type { D20Room } from "@/lib/d20-types";

const PLAYER_NAME_STORAGE_KEY = "jose-games-d20-name";
const PLAYER_SESSION_STORAGE_KEY = "jose-games-d20-session";
const ROOM_POLL_INTERVAL_MS = 2000;

type D20GameProps = {
  backendConfigured: boolean;
};

type ApiRoomResponse = {
  room?: D20Room;
  error?: string;
  success?: boolean;
};

export default function D20Game({ backendConfigured }: D20GameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room"));
  const joinAttemptedRoomCodeRef = useRef<string | null>(null);

  const [sessionId] = useState(() => getOrCreateD20SessionId());
  const [displayName, setDisplayName] = useState(() => getStoredD20Name());
  const [room, setRoom] = useState<D20Room | null>(null);
  const [createTitle, setCreateTitle] = useState("D20 Roll Off");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
        const nextRoom = await fetchD20Room(roomCode);

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
  const currentRound = roomState?.currentRound ?? null;
  const currentUser = roomState?.players.find((player) => player.sessionId === sessionId) ?? null;
  const isHost = currentUser?.isHost ?? false;
  const rollsBySessionId = new Map(currentRound?.rolls.map((roll) => [roll.sessionId, roll]) ?? []);
  const eligiblePlayers =
    roomState?.players.filter((player) =>
      currentRound?.eligibleSessionIds.includes(player.sessionId) ?? false,
    ) ?? [];
  const winnerNames =
    roomState?.players
      .filter((player) => currentRound?.winnerSessionIds.includes(player.sessionId) ?? false)
      .map((player) => player.name) ?? [];
  const currentUserRoll = currentRound ? rollsBySessionId.get(sessionId) ?? null : null;
  const currentUserIsEligible = currentRound?.eligibleSessionIds.includes(sessionId) ?? false;
  const playersRemaining = eligiblePlayers.filter(
    (player) => !rollsBySessionId.has(player.sessionId),
  );
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
      const nextRoom = await postRoomAction("/api/d20/create", {
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

  async function handleRoll() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/d20/${roomCode}/roll`, {
      sessionId,
    });
  }

  async function handleNextRound() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/d20/${roomCode}/next-round`, {
      sessionId,
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
      await postAction(`/api/d20/${roomCode}/close`, {
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
      <div className="rounded-[1.5rem] border border-emerald-400/18 bg-emerald-400/8 p-6 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-emerald-200/80">
          Backend Needed
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          D20 rooms are ready, but the backend is not configured yet.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run the SQL in `supabase/d20-schema.sql`.
        </p>
      </div>
    );
  }

  if (showLobby) {
    return (
      <div className="space-y-5">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-emerald-200/80">
            Quick Rules
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Everyone in the room gets one d20 roll per round. Highest roll wins. If multiple players tie for the top value, they share the round.
          </p>
          {roomCode && !roomState && !error ? (
            <p className="mt-3 text-sm text-emerald-200/85">Joining room `{roomCode}`...</p>
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
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40"
              />
            </label>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              If you leave this blank, the room will assign the next available `Player N` name.
            </p>
          </section>

          <section className="rounded-[1.5rem] border border-emerald-300/12 bg-emerald-400/6 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-emerald-200/80">
              Create Room
            </p>
            <label className="mt-4 block text-sm text-slate-300">
              Room title
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="D20 Roll Off"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40"
              />
            </label>
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={submitting}
              className="mt-4 w-full rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create D20 Room
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
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base uppercase tracking-[0.24em] text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40"
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
      <section className="rounded-[1.7rem] border border-emerald-300/12 bg-[linear-gradient(180deg,rgba(16,185,129,0.16),rgba(15,23,42,0.72))] p-5 shadow-[0_25px_70px_rgba(0,0,0,0.35)] sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-emerald-100/80">
              Live Room
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              {roomState.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-50/85">
              Room code `{activeRoom.code}`. Everyone in this round gets exactly one roll.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleCopyRoomLink}
              className="rounded-full border border-emerald-100/20 bg-emerald-100/10 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:border-emerald-100/35 hover:bg-emerald-100/14"
            >
              Copy Invite Link
            </button>
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={handleNextRound}
                  disabled={submitting || currentRound?.status !== "complete"}
                  className="rounded-full bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  New Round
                </button>
                <button
                  type="button"
                  onClick={handleCloseRoom}
                  disabled={submitting}
                  className="rounded-full border border-rose-300/25 bg-rose-400/12 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-400/16 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close Room
                </button>
              </>
            ) : null}
          </div>
        </div>

        {copyStatus ? <p className="mt-3 text-sm text-emerald-50/80">{copyStatus}</p> : null}
        {statusMessage ? <p className="mt-3 text-sm text-emerald-50/80">{statusMessage}</p> : null}
        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm text-slate-300">
              Your display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveName}
              disabled={submitting}
              className="rounded-full border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Name
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatCard label="Round" value={String(currentRound?.roundNumber ?? 1)} />
            <StatCard label="Players" value={String(roomState.players.length)} />
            <StatCard
              label="Remaining"
              value={String(playersRemaining.length)}
            />
          </div>

          <div className="mt-6 rounded-[1.4rem] border border-emerald-300/12 bg-emerald-400/7 p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-emerald-200/80">
              Current Round
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {currentRound?.status === "complete" ? "Round complete" : "Roll in progress"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {currentRound?.status === "complete"
                ? winnerNames.length > 1
                  ? `${winnerNames.join(", ")} tied with ${currentRound.highestRoll}.`
                  : `${winnerNames[0] ?? "No winner"} won with ${currentRound?.highestRoll}.`
                : playersRemaining.length > 0
                  ? `${playersRemaining.map((player) => player.name).join(", ")} still need to roll.`
                  : "Waiting for the final roll to land."}
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleRoll}
                disabled={
                  submitting ||
                  currentRound?.status !== "waiting" ||
                  !currentUserIsEligible ||
                  Boolean(currentUserRoll)
                }
                className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {currentUserRoll ? `You rolled ${currentUserRoll.value}` : "Roll d20"}
              </button>

              <p className="text-sm text-slate-400">
                {!currentUserIsEligible
                  ? "You joined after this round started. You are in on the next one."
                  : currentUserRoll
                    ? `Locked in for round ${currentRound?.roundNumber}.`
                    : "One roll per player this round."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
                Players
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">Room roster</h3>
            </div>
            <p className="text-sm text-slate-400">Host starts the next round.</p>
          </div>

          <div className="mt-5 space-y-3">
            {sortedPlayers.map((player) => {
              const roll = rollsBySessionId.get(player.sessionId);
              const isWinner = currentRound?.winnerSessionIds.includes(player.sessionId) ?? false;
              const isEligible = currentRound?.eligibleSessionIds.includes(player.sessionId) ?? false;

              return (
                <div
                  key={player.sessionId}
                  className={`rounded-[1.2rem] border px-4 py-3 transition ${
                    isWinner
                      ? "border-emerald-300/35 bg-emerald-300/12"
                      : "border-white/8 bg-slate-950/45"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-white">{player.name}</p>
                        {player.isHost ? (
                          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                            Host
                          </span>
                        ) : null}
                        {player.sessionId === sessionId ? (
                          <span className="rounded-full border border-white/10 bg-white/7 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                            You
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {isEligible ? "In this round" : "Waiting for next round"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Roll</p>
                      <p className="mt-1 text-2xl font-semibold text-white">{roll?.value ?? "-"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
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
    const room = await fetchD20Room(roomCode);
    resolvedDisplayName = getNextDefaultPlayerName(room);
    options?.onResolvedName?.(resolvedDisplayName);
  }

  return postRoomAction("/api/d20/join", {
    code: roomCode,
    displayName: resolvedDisplayName,
    sessionId,
  });
}

async function fetchD20Room(roomCode: string) {
  const response = await fetch(`/api/d20/${roomCode}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as ApiRoomResponse;

  if (!response.ok || !payload.room) {
    throw new Error(payload.error ?? "Could not load room.");
  }

  return payload.room;
}

function getNextDefaultPlayerName(room: D20Room) {
  const takenNames = new Set(room.state.players.map((player) => player.name.trim().toLowerCase()));
  let playerNumber = 1;

  while (takenNames.has(`player ${playerNumber}`)) {
    playerNumber += 1;
  }

  return `Player ${playerNumber}`;
}

function getStoredD20Name() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "";
}

function getOrCreateD20SessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const storedSessionId = window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);

  if (storedSessionId) {
    return storedSessionId;
  }

  const nextSessionId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `d20-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}
