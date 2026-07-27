import {
  createD20RoomState,
  createRoomCode,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
  startNextD20Round,
  submitD20Roll,
  upsertD20Player,
} from "@/lib/d20";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { D20Room, D20RoomState } from "@/lib/d20-types";

const D20_ROOMS_TABLE = "d20_rooms" as const;
const MAX_MUTATION_RETRIES = 5;
const ROOM_INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ROOM_EXPIRED_ERROR_MESSAGE =
  "This room expired after 24 hours of inactivity. Create a new one.";

type D20RoomRecord = {
  code: string;
  state: D20RoomState;
  version: number;
  created_at: string;
  updated_at: string;
};

export async function createD20Room(input: {
  title: string;
  displayName: string;
  sessionId: string;
}): Promise<D20Room> {
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

  const state = createD20RoomState({
    title,
    hostSessionId: input.sessionId,
    hostName: displayName,
  });
  const supabase = getSupabaseServerClient();

  await deleteExpiredRooms();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from(D20_ROOMS_TABLE)
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
      return mapRoomRecord(data as D20RoomRecord);
    }

    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
  }

  throw new Error("Could not generate a unique room code. Try again.");
}

export async function getD20Room(code: string): Promise<D20Room> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(D20_ROOMS_TABLE)
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
    await supabase.from(D20_ROOMS_TABLE).delete().eq("code", normalizedCode);
    throw new Error(ROOM_EXPIRED_ERROR_MESSAGE);
  }

  return mapRoomRecord(data as D20RoomRecord);
}

export async function joinD20Room(input: {
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

  return mutateD20Room(input.code, (state) =>
    upsertD20Player(state, {
      sessionId: input.sessionId,
      name: displayName,
    }),
  );
}

export async function rollInD20Room(input: {
  code: string;
  sessionId: string;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateD20Room(input.code, (state) => submitD20Roll(state, input));
}

export async function advanceD20RoomRound(input: {
  code: string;
  sessionId: string;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateD20Room(input.code, (state) => startNextD20Round(state, input.sessionId));
}

export async function closeD20Room(input: { code: string; sessionId: string }) {
  const normalizedCode = normalizeRoomCode(input.code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  const currentRoom = await getD20Room(normalizedCode);

  if (currentRoom.state.hostSessionId !== input.sessionId) {
    throw new Error("Only the host can do that.");
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from(D20_ROOMS_TABLE).delete().eq("code", normalizedCode);

  if (error) {
    throw new Error(error.message);
  }
}

async function mutateD20Room(
  code: string,
  mutate: (state: D20RoomState) => D20RoomState,
): Promise<D20Room> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();

  for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt += 1) {
    const currentRoom = await getD20Room(normalizedCode);
    const nextState = mutate(structuredClone(currentRoom.state));
    const nextVersion = currentRoom.version + 1;
    const nextUpdatedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from(D20_ROOMS_TABLE)
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
      return mapRoomRecord(data as D20RoomRecord);
    }

    if (error) {
      throw new Error(error.message);
    }
  }

  throw new Error("This room updated at the same time as your action. Try again.");
}

function mapRoomRecord(record: D20RoomRecord): D20Room {
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
    .from(D20_ROOMS_TABLE)
    .delete()
    .lt("updated_at", getRoomExpiryCutoffIso());
}

function isRoomExpired(updatedAt: string) {
  return Date.parse(updatedAt) <= Date.now() - ROOM_INACTIVITY_WINDOW_MS;
}

function getRoomExpiryCutoffIso() {
  return new Date(Date.now() - ROOM_INACTIVITY_WINDOW_MS).toISOString();
}
