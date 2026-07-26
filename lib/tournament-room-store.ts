import {
  closeCurrentMatch,
  createRoomCode,
  createTournamentRoomState,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
  resolveTie,
  startTournament,
  submitVote,
  upsertPlayer,
} from "@/lib/tournament";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { TournamentRoom, TournamentRoomState } from "@/lib/tournament-types";

const TOURNAMENT_ROOMS_TABLE = "tournament_rooms" as const;
const MAX_MUTATION_RETRIES = 5;
const ROOM_INACTIVITY_WINDOW_MS = 30 * 60 * 1000;
const ROOM_EXPIRED_ERROR_MESSAGE =
  "This room expired after 30 minutes of inactivity. Create a new one.";

type TournamentRoomRecord = {
  code: string;
  state: TournamentRoomState;
  version: number;
  created_at: string;
  updated_at: string;
};

export async function createTournamentRoom(input: {
  title: string;
  entries: Array<{
    label: string;
    year?: number | null;
    posterUrl?: string;
    tmdbId?: number;
  }>;
  displayName: string;
  sessionId: string;
}): Promise<TournamentRoom> {
  const title = normalizeRoomTitle(input.title);
  const displayName = normalizeDisplayName(input.displayName);
  const entries = input.entries
    .map((entry) => ({
      label: entry.label.trim().slice(0, 80),
      year: entry.year ?? null,
      posterUrl: entry.posterUrl,
      tmdbId: entry.tmdbId,
    }))
    .filter((entry) => entry.label.length > 0);

  if (!title) {
    throw new Error("Add a room title before creating the bracket.");
  }

  if (!displayName) {
    throw new Error("Add your display name before creating a room.");
  }

  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  const state = createTournamentRoomState({
    title,
    entries,
    hostSessionId: input.sessionId,
    hostName: displayName,
  });
  const supabase = getSupabaseServerClient();

  await deleteExpiredRooms();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from(TOURNAMENT_ROOMS_TABLE)
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
      return mapRoomRecord(data as TournamentRoomRecord);
    }

    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
  }

  throw new Error("Could not generate a unique room code. Try again.");
}

export async function getTournamentRoom(code: string): Promise<TournamentRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(TOURNAMENT_ROOMS_TABLE)
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
    await supabase.from(TOURNAMENT_ROOMS_TABLE).delete().eq("code", normalizedCode);
    throw new Error(ROOM_EXPIRED_ERROR_MESSAGE);
  }

  return mapRoomRecord(data as TournamentRoomRecord);
}

export async function joinTournamentRoom(input: {
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

  return mutateTournamentRoom(input.code, (state) =>
    upsertPlayer(state, {
      sessionId: input.sessionId,
      name: displayName,
    }),
  );
}

export async function startTournamentRoom(input: {
  code: string;
  sessionId: string;
}) {
  return mutateTournamentRoom(input.code, (state) =>
    startTournament(state, input.sessionId),
  );
}

export async function voteInTournamentRoom(input: {
  code: string;
  sessionId: string;
  entryId: string;
}) {
  return mutateTournamentRoom(input.code, (state) =>
    submitVote(state, {
      sessionId: input.sessionId,
      entryId: input.entryId,
    }),
  );
}

export async function closeTournamentMatch(input: {
  code: string;
  sessionId: string;
}) {
  return mutateTournamentRoom(input.code, (state) =>
    closeCurrentMatch(state, input.sessionId),
  );
}

export async function resolveTournamentTie(input: {
  code: string;
  sessionId: string;
  winnerEntryId: string;
}) {
  return mutateTournamentRoom(input.code, (state) =>
    resolveTie(state, {
      sessionId: input.sessionId,
      winnerEntryId: input.winnerEntryId,
    }),
  );
}

async function mutateTournamentRoom(
  code: string,
  mutate: (state: TournamentRoomState) => TournamentRoomState,
): Promise<TournamentRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();

  for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt += 1) {
    const currentRoom = await getTournamentRoom(normalizedCode);
    const nextState = mutate(structuredClone(currentRoom.state));
    const nextVersion = currentRoom.version + 1;
    const nextUpdatedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from(TOURNAMENT_ROOMS_TABLE)
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
      return mapRoomRecord(data as TournamentRoomRecord);
    }

    if (error) {
      throw new Error(error.message);
    }
  }

  throw new Error("This room updated at the same time as your action. Try again.");
}

function mapRoomRecord(record: TournamentRoomRecord): TournamentRoom {
  return {
    code: record.code,
    state: record.state,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function deleteExpiredRooms() {
  const supabase = getSupabaseServerClient();

  await supabase
    .from(TOURNAMENT_ROOMS_TABLE)
    .delete()
    .lt("updated_at", getRoomExpiryCutoffIso());
}

function isRoomExpired(updatedAt: string) {
  return Date.parse(updatedAt) <= Date.now() - ROOM_INACTIVITY_WINDOW_MS;
}

function getRoomExpiryCutoffIso() {
  return new Date(Date.now() - ROOM_INACTIVITY_WINDOW_MS).toISOString();
}
