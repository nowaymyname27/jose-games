import {
  createRoomCode,
  createWavelengthRoomState,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
  serializeWavelengthRoomForSession,
  selectWavelengthSpectrum,
  startWavelengthGame,
  submitWavelengthClue,
  submitWavelengthGuess,
  toggleReadyForNextWavelengthRound,
  upsertWavelengthPlayer,
} from "@/lib/wavelength";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { WavelengthRoom, WavelengthRoomState } from "@/lib/wavelength-types";

const WAVELENGTH_ROOMS_TABLE = "wavelength_rooms" as const;
const MAX_MUTATION_RETRIES = 5;
const ROOM_INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ROOM_EXPIRED_ERROR_MESSAGE =
  "This room expired after 24 hours of inactivity. Create a new one.";

type WavelengthRoomRecord = {
  code: string;
  state: WavelengthRoomState;
  version: number;
  created_at: string;
  updated_at: string;
};

export async function createWavelengthRoom(input: {
  title: string;
  displayName: string;
  sessionId: string;
}): Promise<WavelengthRoom> {
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

  const state = createWavelengthRoomState({
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
      .from(WAVELENGTH_ROOMS_TABLE)
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
      return mapRoomRecord(data as WavelengthRoomRecord);
    }

    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
  }

  throw new Error("Could not generate a unique room code. Try again.");
}

export async function getWavelengthRoom(code: string): Promise<WavelengthRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(WAVELENGTH_ROOMS_TABLE)
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
    await supabase.from(WAVELENGTH_ROOMS_TABLE).delete().eq("code", normalizedCode);
    throw new Error(ROOM_EXPIRED_ERROR_MESSAGE);
  }

  return mapRoomRecord(data as WavelengthRoomRecord);
}

export async function getWavelengthRoomForSession(code: string, sessionId: string | null | undefined) {
  const room = await getWavelengthRoom(code);
  return serializeWavelengthRoomForSession(room, sessionId);
}

export async function joinWavelengthRoom(input: {
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

  return mutateWavelengthRoom(input.code, (state) =>
    upsertWavelengthPlayer(state, {
      sessionId: input.sessionId,
      name: displayName,
    }),
  );
}

export async function startWavelengthRoom(input: { code: string; sessionId: string }) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateWavelengthRoom(input.code, (state) => startWavelengthGame(state, input.sessionId));
}

export async function submitWavelengthRoomClue(input: {
  code: string;
  sessionId: string;
  clueText: string;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateWavelengthRoom(input.code, (state) => submitWavelengthClue(state, input));
}

export async function selectWavelengthRoomSpectrum(input: {
  code: string;
  sessionId: string;
  optionId: string;
  customLeftLabel?: string;
  customRightLabel?: string;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateWavelengthRoom(input.code, (state) => selectWavelengthSpectrum(state, input));
}

export async function submitWavelengthRoomGuess(input: {
  code: string;
  sessionId: string;
  position: number;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateWavelengthRoom(input.code, (state) => submitWavelengthGuess(state, input));
}

export async function toggleWavelengthRoomReadyForNextRound(input: {
  code: string;
  sessionId: string;
}) {
  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  return mutateWavelengthRoom(input.code, (state) =>
    toggleReadyForNextWavelengthRound(state, input.sessionId),
  );
}

export async function closeWavelengthRoom(input: { code: string; sessionId: string }) {
  const normalizedCode = normalizeRoomCode(input.code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  if (!input.sessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  const currentRoom = await getWavelengthRoom(normalizedCode);

  if (currentRoom.state.hostSessionId !== input.sessionId) {
    throw new Error("Only the host can do that.");
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from(WAVELENGTH_ROOMS_TABLE).delete().eq("code", normalizedCode);

  if (error) {
    throw new Error(error.message);
  }
}

async function mutateWavelengthRoom(
  code: string,
  mutate: (state: WavelengthRoomState) => WavelengthRoomState,
): Promise<WavelengthRoom> {
  const normalizedCode = normalizeRoomCode(code);

  if (!normalizedCode) {
    throw new Error("Enter a valid room code.");
  }

  const supabase = getSupabaseServerClient();

  for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt += 1) {
    const currentRoom = await getWavelengthRoom(normalizedCode);
    const nextState = mutate(structuredClone(currentRoom.state));
    const nextVersion = currentRoom.version + 1;
    const nextUpdatedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from(WAVELENGTH_ROOMS_TABLE)
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
      return mapRoomRecord(data as WavelengthRoomRecord);
    }

    if (error) {
      throw new Error(error.message);
    }
  }

  throw new Error("This room updated at the same time as your action. Try again.");
}

function mapRoomRecord(record: WavelengthRoomRecord): WavelengthRoom {
  return {
    code: record.code,
    state: {
      ...record.state,
      scoresBySessionId: record.state.scoresBySessionId ?? {},
      usedSpectrumIds: record.state.usedSpectrumIds ?? [],
      currentRound: record.state.currentRound
        ? {
            ...record.state.currentRound,
            spectrum: record.state.currentRound.spectrum ?? null,
            spectrumOptions: record.state.currentRound.spectrumOptions ?? [],
            clueText: record.state.currentRound.clueText ?? null,
            targetPosition: record.state.currentRound.targetPosition ?? null,
            scoreZones: record.state.currentRound.scoreZones ?? [],
            guesses: record.state.currentRound.guesses ?? [],
            clueGiverPoints: record.state.currentRound.clueGiverPoints ?? null,
            readyForNextRoundSessionIds: record.state.currentRound.readyForNextRoundSessionIds ?? [],
            revealedAt: record.state.currentRound.revealedAt ?? null,
          }
        : null,
    },
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function deleteExpiredRooms() {
  const supabase = getSupabaseServerClient();

  await supabase
    .from(WAVELENGTH_ROOMS_TABLE)
    .delete()
    .lt("updated_at", getRoomExpiryCutoffIso());
}

function isRoomExpired(updatedAt: string) {
  return Date.parse(updatedAt) <= Date.now() - ROOM_INACTIVITY_WINDOW_MS;
}

function getRoomExpiryCutoffIso() {
  return new Date(Date.now() - ROOM_INACTIVITY_WINDOW_MS).toISOString();
}
