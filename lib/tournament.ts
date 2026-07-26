import type {
  BracketSize,
  TournamentEntry,
  TournamentMatch,
  TournamentPlayer,
  TournamentRoomState,
} from "@/lib/tournament-types";
import { VALID_BRACKET_SIZES } from "@/lib/tournament-types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRoomCode(code: string | null | undefined): string {
  return code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
}

export function normalizeDisplayName(name: string | null | undefined): string {
  return name?.trim().replace(/\s+/g, " ").slice(0, 32) ?? "";
}

export function normalizeRoomTitle(title: string | null | undefined): string {
  return title?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
}

export function parseTournamentEntries(rawEntries: string): string[] {
  const seen = new Set<string>();

  return rawEntries
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((entry) => entry.slice(0, 80));
}

export function getBracketSize(entryCount: number): BracketSize | null {
  return VALID_BRACKET_SIZES.find((size) => size === entryCount) ?? null;
}

export function createRoomCode(length = 6): string {
  return Array.from({ length }, () => {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    return ROOM_CODE_ALPHABET[randomIndex];
  }).join("");
}

export function createTournamentRoomState(input: {
  title: string;
  entries: Array<{
    label: string;
    year?: number | null;
    posterUrl?: string;
    tmdbId?: number;
  }>;
  hostSessionId: string;
  hostName: string;
}): TournamentRoomState {
  const bracketSize = getBracketSize(input.entries.length);

  if (!bracketSize) {
    throw new Error("Tournament rooms need exactly 4, 8, or 16 entries.");
  }

  const createdAt = new Date().toISOString();
  const entries = input.entries.map((entry, index) => ({
    id: `entry-${index + 1}`,
    label: entry.label,
    seed: index + 1,
    year: entry.year,
    posterUrl: entry.posterUrl,
    tmdbId: entry.tmdbId,
  }));

  return {
    title: input.title,
    status: "setup",
    bracketSize,
    hostSessionId: input.hostSessionId,
    players: [
      createPlayer({
        sessionId: input.hostSessionId,
        name: input.hostName,
        isHost: true,
        joinedAt: createdAt,
      }),
    ],
    entries,
    matches: createBracketMatches(entries, bracketSize),
    currentMatchId: null,
    winnerEntryId: null,
    createdAt,
  };
}

export function upsertPlayer(
  state: TournamentRoomState,
  input: { sessionId: string; name: string },
): TournamentRoomState {
  const nextTimestamp = new Date().toISOString();
  const existingPlayer = state.players.find(
    (player) => player.sessionId === input.sessionId,
  );

  if (existingPlayer) {
    existingPlayer.name = input.name;
    existingPlayer.lastSeenAt = nextTimestamp;
    return state;
  }

  state.players.push(
    createPlayer({
      sessionId: input.sessionId,
      name: input.name,
      isHost: state.hostSessionId === input.sessionId,
      joinedAt: nextTimestamp,
    }),
  );

  return state;
}

export function startTournament(
  state: TournamentRoomState,
  sessionId: string,
): TournamentRoomState {
  assertHost(state, sessionId);

  if (state.status !== "setup") {
    throw new Error("This tournament has already started.");
  }

  const firstMatch = findNextOpenMatch(state);

  if (!firstMatch) {
    throw new Error("This bracket does not have a playable opening matchup.");
  }

  state.status = "live";
  state.currentMatchId = firstMatch.id;
  firstMatch.status = "voting";

  return state;
}

export function submitVote(
  state: TournamentRoomState,
  input: { sessionId: string; entryId: string },
): TournamentRoomState {
  assertPlayer(state, input.sessionId);
  const currentMatch = getCurrentMatch(state);

  if (!currentMatch || currentMatch.status !== "voting") {
    throw new Error("There is no active matchup accepting votes right now.");
  }

  if (
    input.entryId !== currentMatch.leftEntryId &&
    input.entryId !== currentMatch.rightEntryId
  ) {
    throw new Error("That vote is not valid for the current matchup.");
  }

  const existingVote = currentMatch.votes.find(
    (vote) => vote.sessionId === input.sessionId,
  );

  if (existingVote) {
    existingVote.entryId = input.entryId;
    existingVote.submittedAt = new Date().toISOString();
  } else {
    currentMatch.votes.push({
      sessionId: input.sessionId,
      entryId: input.entryId,
      submittedAt: new Date().toISOString(),
    });
  }

  touchPlayer(state, input.sessionId);

  if (currentMatch.votes.length >= state.players.length) {
    return closeCurrentMatch(state, state.hostSessionId, true);
  }

  return state;
}

export function closeCurrentMatch(
  state: TournamentRoomState,
  sessionId: string,
  skipHostCheck = false,
): TournamentRoomState {
  if (!skipHostCheck) {
    assertHost(state, sessionId);
  }

  const currentMatch = getCurrentMatch(state);

  if (!currentMatch || currentMatch.status !== "voting") {
    throw new Error("There is no active matchup to close.");
  }

  if (currentMatch.votes.length === 0) {
    throw new Error("At least one vote is needed before closing a matchup.");
  }

  const voteSummary = getMatchVoteSummary(currentMatch);

  if (voteSummary.leadingEntryId && !voteSummary.isTie) {
    return resolveMatchWinner(state, currentMatch.id, voteSummary.leadingEntryId);
  }

  currentMatch.status = "tie";
  return state;
}

export function resolveTie(
  state: TournamentRoomState,
  input: { sessionId: string; winnerEntryId: string },
): TournamentRoomState {
  assertHost(state, input.sessionId);
  const currentMatch = getCurrentMatch(state);

  if (!currentMatch || currentMatch.status !== "tie") {
    throw new Error("There is no tied matchup waiting for a host decision.");
  }

  if (
    input.winnerEntryId !== currentMatch.leftEntryId &&
    input.winnerEntryId !== currentMatch.rightEntryId
  ) {
    throw new Error("The selected tiebreak winner is not in the current matchup.");
  }

  return resolveMatchWinner(state, currentMatch.id, input.winnerEntryId);
}

export function getCurrentMatch(state: TournamentRoomState): TournamentMatch | null {
  if (!state.currentMatchId) {
    return null;
  }

  return state.matches.find((match) => match.id === state.currentMatchId) ?? null;
}

export function getMatchVoteSummary(match: TournamentMatch): {
  counts: Record<string, number>;
  isTie: boolean;
  leadingEntryId: string | null;
} {
  const counts = match.votes.reduce<Record<string, number>>((summary, vote) => {
    summary[vote.entryId] = (summary[vote.entryId] ?? 0) + 1;
    return summary;
  }, {});
  const sortedEntries = Object.entries(counts).sort((left, right) => right[1] - left[1]);

  if (sortedEntries.length === 0) {
    return {
      counts,
      isTie: false,
      leadingEntryId: null,
    };
  }

  const isTie =
    sortedEntries.length > 1 && sortedEntries[0][1] === sortedEntries[1][1];

  return {
    counts,
    isTie,
    leadingEntryId: sortedEntries[0]?.[0] ?? null,
  };
}

export function getEntryById(
  state: TournamentRoomState,
  entryId: string | null,
): TournamentEntry | null {
  if (!entryId) {
    return null;
  }

  return state.entries.find((entry) => entry.id === entryId) ?? null;
}

export function getRounds(state: TournamentRoomState): TournamentMatch[][] {
  const rounds = new Map<number, TournamentMatch[]>();

  for (const match of state.matches) {
    const matchesForRound = rounds.get(match.roundNumber) ?? [];
    matchesForRound.push(match);
    rounds.set(match.roundNumber, matchesForRound);
  }

  return Array.from(rounds.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, matches]) => matches.sort((left, right) => left.slotIndex - right.slotIndex));
}

function createPlayer(input: {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}): TournamentPlayer {
  return {
    sessionId: input.sessionId,
    name: input.name,
    isHost: input.isHost,
    joinedAt: input.joinedAt,
    lastSeenAt: input.joinedAt,
  };
}

function createBracketMatches(
  entries: TournamentEntry[],
  bracketSize: BracketSize,
): TournamentMatch[] {
  const roundCount = Math.log2(bracketSize);
  const matches: TournamentMatch[] = [];

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    const matchesInRound = bracketSize / 2 ** roundNumber;

    for (let slotIndex = 0; slotIndex < matchesInRound; slotIndex += 1) {
      const leftEntryId = roundNumber === 1 ? entries[slotIndex * 2]?.id ?? null : null;
      const rightEntryId = roundNumber === 1 ? entries[slotIndex * 2 + 1]?.id ?? null : null;

      matches.push({
        id: `round-${roundNumber}-match-${slotIndex + 1}`,
        roundNumber,
        slotIndex,
        leftEntryId,
        rightEntryId,
        winnerEntryId: null,
        status: "pending",
        votes: [],
        closedAt: null,
      });
    }
  }

  return matches;
}

function resolveMatchWinner(
  state: TournamentRoomState,
  matchId: string,
  winnerEntryId: string,
): TournamentRoomState {
  const match = state.matches.find((candidate) => candidate.id === matchId);

  if (!match) {
    throw new Error("Could not find the matchup that was being resolved.");
  }

  match.winnerEntryId = winnerEntryId;
  match.status = "complete";
  match.closedAt = new Date().toISOString();

  const nextMatch = state.matches.find(
    (candidate) =>
      candidate.roundNumber === match.roundNumber + 1 &&
      candidate.slotIndex === Math.floor(match.slotIndex / 2),
  );

  if (nextMatch) {
    if (match.slotIndex % 2 === 0) {
      nextMatch.leftEntryId = winnerEntryId;
    } else {
      nextMatch.rightEntryId = winnerEntryId;
    }
  }

  const nextOpenMatch = findNextOpenMatch(state);

  if (nextOpenMatch) {
    state.currentMatchId = nextOpenMatch.id;
    nextOpenMatch.status = "voting";
    return state;
  }

  state.currentMatchId = null;
  state.winnerEntryId = winnerEntryId;
  state.status = "finished";

  return state;
}

function findNextOpenMatch(state: TournamentRoomState): TournamentMatch | null {
  const nextMatch = state.matches
    .filter(
      (match) =>
        match.status === "pending" &&
        match.leftEntryId !== null &&
        match.rightEntryId !== null,
    )
    .sort((left, right) => {
      if (left.roundNumber !== right.roundNumber) {
        return left.roundNumber - right.roundNumber;
      }

      return left.slotIndex - right.slotIndex;
    })[0];

  return nextMatch ?? null;
}

function assertHost(state: TournamentRoomState, sessionId: string) {
  if (state.hostSessionId !== sessionId) {
    throw new Error("Only the host can do that.");
  }
}

function assertPlayer(state: TournamentRoomState, sessionId: string) {
  if (!state.players.some((player) => player.sessionId === sessionId)) {
    throw new Error("Join the room before voting.");
  }
}

function touchPlayer(state: TournamentRoomState, sessionId: string) {
  const player = state.players.find((entry) => entry.sessionId === sessionId);

  if (player) {
    player.lastSeenAt = new Date().toISOString();
  }
}
