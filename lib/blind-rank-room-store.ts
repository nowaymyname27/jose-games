import { readFile } from "node:fs/promises";
import path from "node:path";

import Papa from "papaparse";

import {
  submitBlindRankBestBoardVote,
  closeBlindRankRound,
  createBlindRankRoomState,
  createRoomCode,
  getBlindRankFinalScore,
  normalizeBlindRankFormat,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeBlindRankSlotCount,
  normalizeRoomTitle,
  resolveBlindRankTie,
  skipBlindRankVote,
  startBlindRankGame,
  startNextBlindRankRound,
  submitBlindRankVote,
  upsertBlindRankPlayer,
} from "@/lib/blind-rank";
import type { BlindRankMovie, BlindRankRoom, BlindRankRoomState } from "@/lib/blind-rank-types";
import { getMovieKey } from "@/lib/movie-key";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const BLIND_RANK_ROOMS_TABLE = "blind_rank_rooms" as const;
const MAX_MUTATION_RETRIES = 5;
const ROOM_INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ROOM_EXPIRED_ERROR_MESSAGE =
  "This room expired after 24 hours of inactivity. Create a new one.";
const RATINGS_FILE_PATH = path.join(process.cwd(), "public/data/ratings.csv");
const POSTER_FILE_PATH = path.join(process.cwd(), "public/data/movie-posters.json");

type BlindRankRoomRecord = {
  code: string;
  state: BlindRankRoomState;
  version: number;
  created_at: string;
  updated_at: string;
};

type CsvRow = {
  Name?: string;
  Year?: string;
  Rating?: string;
};

type PosterMap = Record<string, { posterUrl?: string }>;

export async function createBlindRankRoom(input: {
  title: string;
  displayName: string;
  sessionId: string;
  slotCount: number;
  format: string;
}): Promise<BlindRankRoom> {
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

  const state = createBlindRankRoomState({
    title,
    hostSessionId: input.sessionId,
    hostName: displayName,
    movies: await loadBlindRankMovies(),
    slotCount: input.slotCount,
    format: normalizeBlindRankFormat(input.format),
  });
  const supabase = getSupabaseServerClient();

  await deleteExpiredRooms();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from(BLIND_RANK_ROOMS_TABLE)
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
      return mapRoomRecord(data as BlindRankRoomRecord);
    }

    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
  }

  throw new Error("Could not generate a unique room code. Try again.");
}

export async function getBlindRankRoom(code: string): Promise<BlindRankRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(BLIND_RANK_ROOMS_TABLE)
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
    await supabase.from(BLIND_RANK_ROOMS_TABLE).delete().eq("code", normalizedCode);
    throw new Error(ROOM_EXPIRED_ERROR_MESSAGE);
  }

  return mapRoomRecord(data as BlindRankRoomRecord);
}

export async function joinBlindRankRoom(input: {
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

  return mutateBlindRankRoom(input.code, (state) =>
    upsertBlindRankPlayer(state, {
      sessionId: input.sessionId,
      name: displayName,
    }),
  );
}

export async function startBlindRankRoom(input: { code: string; sessionId: string }) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateBlindRankRoom(input.code, (state) => startBlindRankGame(state, input.sessionId));
}

export async function voteInBlindRankRoom(input: {
  code: string;
  sessionId: string;
  slot: number;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateBlindRankRoom(input.code, (state) => submitBlindRankVote(state, input));
}

export async function skipBlindRankRoomVote(input: { code: string; sessionId: string }) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateBlindRankRoom(input.code, (state) => skipBlindRankVote(state, input));
}

export async function closeBlindRankVoting(input: { code: string; sessionId: string }) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateBlindRankRoom(input.code, (state) => closeBlindRankRound(state, input.sessionId));
}

export async function resolveBlindRankRoomTie(input: {
  code: string;
  sessionId: string;
  slot: number;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateBlindRankRoom(input.code, (state) => resolveBlindRankTie(state, input));
}

export async function advanceBlindRankRoomRound(input: {
  code: string;
  sessionId: string;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateBlindRankRoom(input.code, (state) => startNextBlindRankRound(state, input.sessionId));
}

export async function voteForBestBlindRankBoard(input: {
  code: string;
  sessionId: string;
  targetSessionId: string;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateBlindRankRoom(input.code, (state) => submitBlindRankBestBoardVote(state, input));
}

export async function closeBlindRankRoom(input: { code: string; sessionId: string }) {
  const normalizedCode = normalizeRoomCode(input.code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  const currentRoom = await getBlindRankRoom(normalizedCode);

  if (currentRoom.state.hostSessionId !== input.sessionId) {
    throw new Error("Only the host can do that.");
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from(BLIND_RANK_ROOMS_TABLE).delete().eq("code", normalizedCode);

  if (error) {
    throw new Error(error.message);
  }
}

async function mutateBlindRankRoom(
  code: string,
  mutate: (state: BlindRankRoomState) => BlindRankRoomState,
): Promise<BlindRankRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();

  for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt += 1) {
    const currentRoom = await getBlindRankRoom(normalizedCode);
    const nextState = mutate(structuredClone(currentRoom.state));
    const nextVersion = currentRoom.version + 1;
    const nextUpdatedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from(BLIND_RANK_ROOMS_TABLE)
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
      return mapRoomRecord(data as BlindRankRoomRecord);
    }

    if (error) {
      throw new Error(error.message);
    }
  }

  throw new Error("This room updated at the same time as your action. Try again.");
}

function mapRoomRecord(record: BlindRankRoomRecord): BlindRankRoom {
  const state = {
    ...record.state,
    slotCount: normalizeBlindRankSlotCount(record.state.slotCount),
    format: normalizeBlindRankFormat(record.state.format),
    currentTurnIndex: record.state.currentTurnIndex ?? 0,
    soloMovies: record.state.soloMovies ?? null,
    soloBoards: record.state.soloBoards ?? {},
    soloNextMovieIndexBySessionId: record.state.soloNextMovieIndexBySessionId ?? {},
    soloFinishedSessionIds: record.state.soloFinishedSessionIds ?? [],
    soloPhase: record.state.soloPhase ?? null,
    bestBoardVotes: record.state.bestBoardVotes ?? [],
    currentRound: record.state.currentRound
      ? {
          ...record.state.currentRound,
          chooserSessionId: record.state.currentRound.chooserSessionId ?? null,
          votes: record.state.currentRound.votes ?? [],
          skippedSessionIds: record.state.currentRound.skippedSessionIds ?? [],
        }
      : null,
  };

  return {
    code: record.code,
    state,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function loadBlindRankMovies(): Promise<BlindRankMovie[]> {
  const [ratingsCsv, posterMap] = await Promise.all([
    readFile(RATINGS_FILE_PATH, "utf8"),
    loadPosterMap(),
  ]);

  const result = Papa.parse<CsvRow>(ratingsCsv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  return result.data
    .map((row) => normalizeMovie(row, posterMap))
    .filter((movie): movie is BlindRankMovie => movie !== null);
}

function normalizeMovie(row: CsvRow, posterMap: PosterMap): BlindRankMovie | null {
  const name = row.Name?.trim();
  const rating = Number(row.Rating?.trim());
  const parsedYear = Number(row.Year?.trim());

  if (!name || Number.isNaN(rating)) {
    return null;
  }

  const year = Number.isNaN(parsedYear) ? null : parsedYear;
  const id = getMovieKey(name, year);

  return {
    id,
    name,
    year,
    rating,
    posterUrl: posterMap[id]?.posterUrl,
  };
}

async function loadPosterMap(): Promise<PosterMap> {
  try {
    const posterJson = await readFile(POSTER_FILE_PATH, "utf8");
    return JSON.parse(posterJson) as PosterMap;
  } catch {
    return {};
  }
}

async function deleteExpiredRooms() {
  const supabase = getSupabaseServerClient();

  await supabase
    .from(BLIND_RANK_ROOMS_TABLE)
    .delete()
    .lt("updated_at", getRoomExpiryCutoffIso());
}

function isRoomExpired(updatedAt: string) {
  return Date.parse(updatedAt) <= Date.now() - ROOM_INACTIVITY_WINDOW_MS;
}

function getRoomExpiryCutoffIso() {
  return new Date(Date.now() - ROOM_INACTIVITY_WINDOW_MS).toISOString();
}

export { getBlindRankFinalScore };
