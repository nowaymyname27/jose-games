import {
  createGuessWhoRoomState,
  createRoomCode,
  isGuessWhoCategory,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
  parseBoardSize,
  upsertGuessWhoPlayer,
} from "@/lib/guess-who";
import { getGuessWhoCatalog } from "@/lib/guess-who-catalog";
import type { GuessWhoCategoryId, GuessWhoRoom, GuessWhoRoomState } from "@/lib/guess-who-types";
import { normalizeSeed } from "@/lib/seeded-random";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const GUESS_WHO_ROOMS_TABLE = "guess_who_rooms" as const;
const MAX_MUTATION_RETRIES = 5;
const ROOM_INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ROOM_EXPIRED_ERROR_MESSAGE =
  "This room expired after 24 hours of inactivity. Create a new one.";

type GuessWhoRoomRecord = {
  code: string;
  state: GuessWhoRoomState;
  version: number;
  created_at: string;
  updated_at: string;
};

export async function createGuessWhoRoom(input: {
  title: string;
  displayName: string;
  sessionId: string;
  categoryId: string;
  boardSize: number;
  seed: string;
}): Promise<GuessWhoRoom> {
  const title = normalizeRoomTitle(input.title);
  const displayName = normalizeDisplayName(input.displayName);

  if (!title) {
    throw new Error("Add a room title before creating a room.");
  }

  if (!displayName) {
    throw new Error("Add your display name before creating a room.");
  }

  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  const { categoryId, boardSize, seed } = resolveRoomBoardConfig(input.categoryId, input.boardSize, input.seed);
  const state = createGuessWhoRoomState({
    title,
    hostSessionId: input.sessionId,
    hostName: displayName,
    categoryId,
    boardSize,
    seed,
  });
  const supabase = getSupabaseServerClient();

  await deleteExpiredRooms();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from(GUESS_WHO_ROOMS_TABLE)
      .insert({
        code,
        state,
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select("code, state, version, created_at, updated_at")
      .single();

    if (!error && data) {
      return mapRoomRecord(data as GuessWhoRoomRecord);
    }

    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
  }

  throw new Error("Could not generate a unique room code. Try again.");
}

export async function getGuessWhoRoom(code: string): Promise<GuessWhoRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(GUESS_WHO_ROOMS_TABLE)
    .select("code, state, version, created_at, updated_at")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Room not found.");
  }

  if (isRoomExpired(data.updated_at)) {
    await supabase.from(GUESS_WHO_ROOMS_TABLE).delete().eq("code", normalizedCode);
    throw new Error(ROOM_EXPIRED_ERROR_MESSAGE);
  }

  return mapRoomRecord(data as GuessWhoRoomRecord);
}

export async function joinGuessWhoRoom(input: {
  code: string;
  displayName: string;
  sessionId: string;
}) {
  const displayName = normalizeDisplayName(input.displayName);

  if (!displayName) {
    throw new Error("Add your display name before joining.");
  }

  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateGuessWhoRoom(input.code, (state) =>
    upsertGuessWhoPlayer(state, {
      sessionId: input.sessionId,
      name: displayName,
    }),
  );
}

export async function closeGuessWhoRoom(input: { code: string; sessionId: string }) {
  const normalizedCode = normalizeRoomCode(input.code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  const currentRoom = await getGuessWhoRoom(normalizedCode);

  if (currentRoom.state.hostSessionId !== input.sessionId) {
    throw new Error("Only the host can do that.");
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from(GUESS_WHO_ROOMS_TABLE).delete().eq("code", normalizedCode);

  if (error) {
    throw new Error(error.message);
  }
}

async function mutateGuessWhoRoom(
  code: string,
  mutate: (state: GuessWhoRoomState) => GuessWhoRoomState,
): Promise<GuessWhoRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();

  for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt += 1) {
    const currentRoom = await getGuessWhoRoom(normalizedCode);
    const nextState = mutate(structuredClone(currentRoom.state));
    const nextVersion = currentRoom.version + 1;
    const nextUpdatedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from(GUESS_WHO_ROOMS_TABLE)
      .update({
        state: nextState,
        version: nextVersion,
        updated_at: nextUpdatedAt,
      })
      .eq("code", normalizedCode)
      .eq("version", currentRoom.version)
      .select("code, state, version, created_at, updated_at")
      .maybeSingle();

    if (!error && data) {
      return mapRoomRecord(data as GuessWhoRoomRecord);
    }

    if (error) {
      throw new Error(error.message);
    }
  }

  throw new Error("This room updated at the same time as your action. Try again.");
}

function mapRoomRecord(record: GuessWhoRoomRecord): GuessWhoRoom {
  return {
    code: record.code,
    state: {
      ...record.state,
      seed: normalizeSeed(record.state.seed),
      players: record.state.players.map((player) => ({
        ...player,
        role: player.role === "player" ? "player" : "spectator",
        seat: player.seat === 1 || player.seat === 2 ? player.seat : null,
      })),
    },
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function resolveRoomBoardConfig(categoryId: string, boardSize: number, seed: string) {
  const catalog = getGuessWhoCatalog();
  const nextCategoryId: GuessWhoCategoryId = isGuessWhoCategory(categoryId, catalog.categories)
    ? categoryId
    : catalog.defaultCategoryId;
  const entries = catalog.entriesByCategory[nextCategoryId] ?? [];

  if (entries.length < 2) {
    throw new Error("This category does not have enough entries to build a room board.");
  }

  return {
    categoryId: nextCategoryId,
    boardSize: parseBoardSize(String(boardSize), entries.length),
    seed: normalizeSeed(seed),
  };
}

async function deleteExpiredRooms() {
  const supabase = getSupabaseServerClient();

  await supabase
    .from(GUESS_WHO_ROOMS_TABLE)
    .delete()
    .lt("updated_at", getRoomExpiryCutoffIso());
}

function isRoomExpired(updatedAt: string) {
  return Date.parse(updatedAt) <= Date.now() - ROOM_INACTIVITY_WINDOW_MS;
}

function getRoomExpiryCutoffIso() {
  return new Date(Date.now() - ROOM_INACTIVITY_WINDOW_MS).toISOString();
}
