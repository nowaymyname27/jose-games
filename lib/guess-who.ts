import {
  GUESS_WHO_BOARD_SIZES,
  type GuessWhoCategory,
  type GuessWhoCategoryId,
  type GuessWhoEntry,
  type GuessWhoRoomPlayer,
  type GuessWhoRoomState,
} from "@/lib/guess-who-types";
import { normalizeSeed, shuffleWithSeed } from "@/lib/seeded-random";
import {
  createRoomCode,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
} from "@/lib/tournament";

export { createRoomCode, normalizeDisplayName, normalizeRoomCode, normalizeRoomTitle };

export function getBoardSizeOptions(entryCount: number): number[] {
  const presetSizes = GUESS_WHO_BOARD_SIZES.filter((size) => size <= entryCount);

  if (presetSizes.length > 0) {
    return [...presetSizes];
  }

  return entryCount > 1 ? [entryCount] : [];
}

export function getDefaultBoardSize(entryCount: number): number {
  const options = getBoardSizeOptions(entryCount);

  if (options.includes(24)) {
    return 24;
  }

  return options[options.length - 1] ?? 0;
}

export function parseBoardSize(value: string | null, entryCount: number): number {
  const requestedSize = Number(value);
  const options = getBoardSizeOptions(entryCount);

  if (options.includes(requestedSize)) {
    return requestedSize;
  }

  return getDefaultBoardSize(entryCount);
}

export function buildGuessWhoBoard(
  categoryId: GuessWhoCategoryId,
  entries: GuessWhoEntry[],
  rawSeed: string,
  size: number,
): { entries: GuessWhoEntry[]; seed: string; size: number } {
  const normalizedSeed = normalizeSeed(rawSeed);
  const nextSize = parseBoardSize(String(size), entries.length);
  const seededKey = `${categoryId}:${nextSize}:${normalizedSeed}`;

  return {
    entries: shuffleWithSeed(entries, seededKey).slice(0, nextSize),
    seed: normalizedSeed,
    size: nextSize,
  };
}

export function createRandomSeed(): string {
  const adjectives = ["turbo", "checkered", "apex", "grid", "pit", "slick"];
  const nouns = ["start", "storm", "rocket", "signal", "corner", "sprint"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 900 + 100);

  return `${adjective}-${noun}-${number}`;
}

export function isGuessWhoCategory(
  value: string | null,
  categories: GuessWhoCategory[],
): value is GuessWhoCategoryId {
  return value !== null && categories.some((category) => category.id === value);
}

export function createGuessWhoRoomState(input: {
  title: string;
  hostSessionId: string;
  hostName: string;
  categoryId: GuessWhoCategoryId;
  boardSize: number;
  seed: string;
}): GuessWhoRoomState {
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
    categoryId: input.categoryId,
    boardSize: input.boardSize,
    seed: normalizeSeed(input.seed),
    players: [
      createGuessWhoPlayer({
        sessionId: input.hostSessionId,
        name: hostName,
        isHost: true,
        role: "player",
        seat: 1,
        joinedAt: createdAt,
      }),
    ],
    status: "open",
    createdAt,
  };
}

export function upsertGuessWhoPlayer(
  state: GuessWhoRoomState,
  input: { sessionId: string; name: string },
): GuessWhoRoomState {
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

  const nextSeat = getNextOpenSeat(state.players);

  state.players.push(
    createGuessWhoPlayer({
      sessionId: input.sessionId,
      name: normalizedName,
      isHost: state.hostSessionId === input.sessionId,
      role: nextSeat ? "player" : "spectator",
      seat: nextSeat,
      joinedAt: nextTimestamp,
    }),
  );

  return state;
}

function createGuessWhoPlayer(input: {
  sessionId: string;
  name: string;
  isHost: boolean;
  role: "player" | "spectator";
  seat: 1 | 2 | null;
  joinedAt: string;
}): GuessWhoRoomPlayer {
  return {
    sessionId: input.sessionId,
    name: input.name,
    isHost: input.isHost,
    role: input.role,
    seat: input.seat,
    joinedAt: input.joinedAt,
    lastSeenAt: input.joinedAt,
  };
}

function getNextOpenSeat(players: GuessWhoRoomPlayer[]) {
  const takenSeats = new Set(players.map((player) => player.seat).filter((seat) => seat !== null));

  if (!takenSeats.has(1)) {
    return 1;
  }

  if (!takenSeats.has(2)) {
    return 2;
  }

  return null;
}
