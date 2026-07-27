import {
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
  createRoomCode,
} from "@/lib/tournament";
import type { D20Player, D20RoomState } from "@/lib/d20-types";

export { normalizeDisplayName, normalizeRoomCode, normalizeRoomTitle, createRoomCode };

export function createD20RoomState(input: {
  title: string;
  hostSessionId: string;
  hostName: string;
}): D20RoomState {
  const title = normalizeRoomTitle(input.title);
  const hostName = normalizeDisplayName(input.hostName);

  if (!title) {
    throw new Error("Add a room title before creating a room.");
  }

  if (!hostName) {
    throw new Error("Add your display name before creating a room.");
  }

  if (!input.hostSessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  const createdAt = new Date().toISOString();

  return {
    title,
    hostSessionId: input.hostSessionId,
    players: [
      createPlayer({
        sessionId: input.hostSessionId,
        name: hostName,
        isHost: true,
        joinedAt: createdAt,
      }),
    ],
    currentRound: createRound(1, [input.hostSessionId]),
    createdAt,
  };
}

export function upsertD20Player(
  state: D20RoomState,
  input: { sessionId: string; name: string },
): D20RoomState {
  const nextTimestamp = new Date().toISOString();
  const normalizedName = normalizeDisplayName(input.name);

  if (!normalizedName) {
    throw new Error("Add your display name before joining.");
  }

  const existingPlayer = state.players.find((player) => player.sessionId === input.sessionId);

  if (existingPlayer) {
    existingPlayer.name = normalizedName;
    existingPlayer.lastSeenAt = nextTimestamp;
    return state;
  }

  state.players.push(
    createPlayer({
      sessionId: input.sessionId,
      name: normalizedName,
      isHost: state.hostSessionId === input.sessionId,
      joinedAt: nextTimestamp,
    }),
  );

  return state;
}

export function submitD20Roll(
  state: D20RoomState,
  input: { sessionId: string },
): D20RoomState {
  assertPlayer(state, input.sessionId);
  const round = state.currentRound;

  if (round.status !== "waiting") {
    throw new Error("This round is already complete. Start a new round first.");
  }

  if (!round.eligibleSessionIds.includes(input.sessionId)) {
    throw new Error("You joined after this round started. Wait for the next round.");
  }

  if (round.rolls.some((roll) => roll.sessionId === input.sessionId)) {
    throw new Error("You already rolled this round.");
  }

  round.rolls.push({
    sessionId: input.sessionId,
    value: rollD20(),
    rolledAt: new Date().toISOString(),
  });

  touchPlayer(state, input.sessionId);

  if (round.rolls.length >= round.eligibleSessionIds.length) {
    finalizeRound(round);
  }

  return state;
}

export function startNextD20Round(
  state: D20RoomState,
  sessionId: string,
): D20RoomState {
  assertHost(state, sessionId);

  if (state.currentRound.status !== "complete") {
    throw new Error("Finish the current round before starting a new one.");
  }

  state.currentRound = createRound(
    state.currentRound.roundNumber + 1,
    state.players.map((player) => player.sessionId),
  );

  touchPlayer(state, sessionId);

  return state;
}

function createPlayer(input: {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}): D20Player {
  return {
    sessionId: input.sessionId,
    name: input.name,
    isHost: input.isHost,
    joinedAt: input.joinedAt,
    lastSeenAt: input.joinedAt,
  };
}

function createRound(roundNumber: number, eligibleSessionIds: string[]) {
  return {
    roundNumber,
    status: "waiting" as const,
    eligibleSessionIds,
    rolls: [],
    highestRoll: null,
    winnerSessionIds: [],
  };
}

function finalizeRound(round: D20RoomState["currentRound"]) {
  const highestRoll = round.rolls.reduce(
    (currentHighest, roll) => Math.max(currentHighest, roll.value),
    0,
  );

  round.highestRoll = highestRoll;
  round.winnerSessionIds = round.rolls
    .filter((roll) => roll.value === highestRoll)
    .map((roll) => roll.sessionId);
  round.status = "complete";
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function assertHost(state: D20RoomState, sessionId: string) {
  if (state.hostSessionId !== sessionId) {
    throw new Error("Only the host can do that.");
  }
}

function assertPlayer(state: D20RoomState, sessionId: string) {
  if (!state.players.some((player) => player.sessionId === sessionId)) {
    throw new Error("Join the room before rolling.");
  }
}

function touchPlayer(state: D20RoomState, sessionId: string) {
  const player = state.players.find((entry) => entry.sessionId === sessionId);

  if (player) {
    player.lastSeenAt = new Date().toISOString();
  }
}
