import {
  createRoomCode,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
} from "@/lib/tournament";
import type {
  BlindRankBoardSlot,
  BlindRankFormat,
  BlindRankMovie,
  BlindRankPlayer,
  BlindRankRoomState,
  BlindRankRound,
} from "@/lib/blind-rank-types";

export { createRoomCode, normalizeDisplayName, normalizeRoomCode, normalizeRoomTitle };

export const BLIND_RANK_DEFAULT_SLOT_COUNT = 10;
export const BLIND_RANK_ALLOWED_SLOT_COUNTS = [5, 10] as const;
export const BLIND_RANK_FORMATS = ["vote", "turns", "solo-compare"] as const;

export function createBlindRankRoomState(input: {
  title: string;
  hostSessionId: string;
  hostName: string;
  movies: BlindRankMovie[];
  slotCount: number;
  format: BlindRankFormat;
}): BlindRankRoomState {
  const title = normalizeRoomTitle(input.title);
  const hostName = normalizeDisplayName(input.hostName);
  const slotCount = normalizeBlindRankSlotCount(input.slotCount);
  const format = normalizeBlindRankFormat(input.format);

  if (!title) {
    throw new Error("Add a room title before creating a room.");
  }

  if (!hostName) {
    throw new Error("Add your display name before creating a room.");
  }

  if (!input.hostSessionId.trim()) {
    throw new Error("Could not identify this browser session.");
  }

  if (input.movies.length < slotCount) {
    throw new Error(`You need at least ${slotCount} rated movies to start a blind ranking room.`);
  }

  const createdAt = new Date().toISOString();

  return {
    title,
    slotCount,
    format,
    status: "setup",
    hostSessionId: input.hostSessionId,
    players: [
      createPlayer({
        sessionId: input.hostSessionId,
        name: hostName,
        isHost: true,
        joinedAt: createdAt,
      }),
    ],
    moviePool: shuffleMovies(input.movies),
    nextMovieIndex: 0,
    currentTurnIndex: 0,
    board: createEmptyBoard(slotCount),
    currentRound: null,
    soloMovies: null,
    soloBoards: {},
    soloNextMovieIndexBySessionId: {},
    soloFinishedSessionIds: [],
    soloPhase: null,
    bestBoardVotes: [],
    createdAt,
    finishedAt: null,
  };
}

export function upsertBlindRankPlayer(
  state: BlindRankRoomState,
  input: { sessionId: string; name: string },
): BlindRankRoomState {
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

  touchPlayer(state, input.sessionId);
  return state;
}

export function startBlindRankGame(
  state: BlindRankRoomState,
  sessionId: string,
): BlindRankRoomState {
  assertHost(state, sessionId);

  if (state.status !== "setup") {
    throw new Error("This room has already started.");
  }

  state.status = "live";
  state.finishedAt = null;
  touchPlayer(state, sessionId);

  if (state.format === "solo-compare") {
    startSoloCompareGame(state);
    return state;
  }

  state.currentRound = createRound(state, 1);
  return state;
}

export function submitBlindRankVote(
  state: BlindRankRoomState,
  input: { sessionId: string; slot: number },
): BlindRankRoomState {
  assertPlayer(state, input.sessionId);

  if (state.status !== "live") {
    throw new Error("There is no live blind ranking round right now.");
  }

  if (state.format === "solo-compare") {
    return submitSoloComparePlacement(state, input);
  }

  const round = getCurrentSharedRound(state, "There is no active movie accepting votes right now.");

  if (!getOpenSlots(state).includes(input.slot)) {
    throw new Error("That slot is already locked in.");
  }

  if (state.format === "turns") {
    if (round.chooserSessionId !== input.sessionId) {
      throw new Error("Wait for your turn to place this movie.");
    }

    touchPlayer(state, input.sessionId);
    return finalizeBlindRankPlacement(state, input.slot);
  }

  if (!round.eligibleSessionIds.includes(input.sessionId)) {
    throw new Error("You joined after this round started. Wait for the next movie.");
  }

  round.skippedSessionIds = round.skippedSessionIds.filter(
    (sessionId) => sessionId !== input.sessionId,
  );

  const existingVote = round.votes.find((vote) => vote.sessionId === input.sessionId);

  if (existingVote) {
    existingVote.slot = input.slot;
    existingVote.submittedAt = new Date().toISOString();
  } else {
    round.votes.push({
      sessionId: input.sessionId,
      slot: input.slot,
      submittedAt: new Date().toISOString(),
    });
  }

  touchPlayer(state, input.sessionId);

  if (getBlindRankRoundResponseCount(round) >= round.eligibleSessionIds.length) {
    return closeBlindRankRound(state, state.hostSessionId, true);
  }

  return state;
}

export function skipBlindRankVote(
  state: BlindRankRoomState,
  input: { sessionId: string },
): BlindRankRoomState {
  assertPlayer(state, input.sessionId);

  if (state.status !== "live") {
    throw new Error("There is no live blind ranking round right now.");
  }

  if (state.format === "solo-compare") {
    throw new Error("Solo compare does not support skipping movies.");
  }

  const round = getCurrentSharedRound(state, "There is no active movie accepting responses right now.");

  if (state.format === "turns") {
    if (round.chooserSessionId !== input.sessionId) {
      throw new Error("Wait for your turn to skip this movie.");
    }

    round.votes = [];
    round.skippedSessionIds = [input.sessionId];
    return finalizeSkippedBlindRankRound(state, input.sessionId);
  }

  if (!round.eligibleSessionIds.includes(input.sessionId)) {
    throw new Error("You joined after this round started. Wait for the next movie.");
  }

  round.votes = round.votes.filter((vote) => vote.sessionId !== input.sessionId);

  if (!round.skippedSessionIds.includes(input.sessionId)) {
    round.skippedSessionIds.push(input.sessionId);
  }

  touchPlayer(state, input.sessionId);

  if (getBlindRankRoundResponseCount(round) >= round.eligibleSessionIds.length) {
    return closeBlindRankRound(state, state.hostSessionId, true);
  }

  return state;
}

export function closeBlindRankRound(
  state: BlindRankRoomState,
  sessionId: string,
  skipHostCheck = false,
): BlindRankRoomState {
  if (!skipHostCheck) {
    assertHost(state, sessionId);
  }

  if (state.status !== "live") {
    throw new Error("There is no live blind ranking round right now.");
  }

  if (state.format !== "vote") {
    throw new Error("Only vote mode uses host-controlled voting close.");
  }

  const round = getCurrentSharedRound(state, "There is no active movie to close.");

  if (round.votes.length === 0) {
    if (round.skippedSessionIds.length >= round.eligibleSessionIds.length) {
      return finalizeSkippedBlindRankRound(state, sessionId);
    }

    throw new Error("At least one slot vote is needed unless everyone skips the movie.");
  }

  const summary = getBlindRankVoteSummary(round);

  if (summary.leadingSlot !== null && !summary.isTie) {
    return finalizeBlindRankPlacement(state, summary.leadingSlot);
  }

  round.status = "tie";
  touchPlayer(state, sessionId);
  return state;
}

export function resolveBlindRankTie(
  state: BlindRankRoomState,
  input: { sessionId: string; slot: number },
): BlindRankRoomState {
  assertHost(state, input.sessionId);

  if (state.status !== "live") {
    throw new Error("There is no live blind ranking round right now.");
  }

  if (state.format !== "vote") {
    throw new Error("Only vote mode uses tied voting.");
  }

  const round = state.currentRound;

  if (!round || round.status !== "tie") {
    throw new Error("There is no tied vote waiting for a host decision.");
  }

  const summary = getBlindRankVoteSummary(round);

  if (!summary.tiedSlots.includes(input.slot)) {
    throw new Error("Pick one of the tied slots.");
  }

  return finalizeBlindRankPlacement(state, input.slot);
}

export function startNextBlindRankRound(
  state: BlindRankRoomState,
  sessionId: string,
): BlindRankRoomState {
  assertHost(state, sessionId);

  if (state.status !== "live") {
    throw new Error("This room is not waiting for another round.");
  }

  if (state.format === "solo-compare") {
    throw new Error("Solo compare does not use shared next-round controls.");
  }

  if (!state.currentRound || !["revealed", "skipped"].includes(state.currentRound.status)) {
    throw new Error("Finish revealing the current movie before starting the next round.");
  }

  if (isBoardFilled(state)) {
    throw new Error(`All ${state.slotCount} slots are already locked in.`);
  }

  if (state.format === "turns") {
    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
  }

  state.currentRound = createRound(state, state.currentRound.roundNumber + 1);
  touchPlayer(state, sessionId);

  return state;
}

export function submitBlindRankBestBoardVote(
  state: BlindRankRoomState,
  input: { sessionId: string; targetSessionId: string },
): BlindRankRoomState {
  assertPlayer(state, input.sessionId);
  assertPlayer(state, input.targetSessionId);

  if (state.status !== "live") {
    throw new Error("There is no live blind ranking round right now.");
  }

  if (state.format !== "solo-compare") {
    throw new Error("Best-board voting is only available in solo compare mode.");
  }

  if (state.soloPhase !== "judging") {
    throw new Error("Wait until every player finishes ranking before voting on the best board.");
  }

  if (input.sessionId === input.targetSessionId) {
    throw new Error("You cannot vote for your own board.");
  }

  if (!state.soloBoards[input.targetSessionId]) {
    throw new Error("That player does not have a board in this game.");
  }

  const existingVote = state.bestBoardVotes.find((vote) => vote.sessionId === input.sessionId);

  if (existingVote) {
    existingVote.targetSessionId = input.targetSessionId;
    existingVote.submittedAt = new Date().toISOString();
  } else {
    state.bestBoardVotes.push({
      sessionId: input.sessionId,
      targetSessionId: input.targetSessionId,
      submittedAt: new Date().toISOString(),
    });
  }

  touchPlayer(state, input.sessionId);

  if (state.bestBoardVotes.length >= getSoloEligibleVoterSessionIds(state).length) {
    state.status = "finished";
    state.finishedAt = new Date().toISOString();
  }

  return state;
}

export function getBlindRankVoteSummary(round: BlindRankRound) {
  const counts = round.votes.reduce<Record<number, number>>((summary, vote) => {
    summary[vote.slot] = (summary[vote.slot] ?? 0) + 1;
    return summary;
  }, {});
  const sortedEntries = Object.entries(counts)
    .map(([slot, count]) => ({ slot: Number(slot), count }))
    .sort((left, right) => right.count - left.count || left.slot - right.slot);

  if (sortedEntries.length === 0) {
    return {
      counts,
      isTie: false,
      leadingSlot: null,
      tiedSlots: [] as number[],
    };
  }

  const topCount = sortedEntries[0]?.count ?? 0;
  const tiedSlots = sortedEntries.filter((entry) => entry.count === topCount).map((entry) => entry.slot);

  return {
    counts,
    isTie: tiedSlots.length > 1,
    leadingSlot: tiedSlots[0] ?? null,
    tiedSlots,
  };
}

export function getBlindRankRoundResponseCount(round: BlindRankRound) {
  return round.votes.length + round.skippedSessionIds.length;
}

export function getOpenSlots(state: BlindRankRoomState) {
  return state.board.filter((entry) => entry.movie === null).map((entry) => entry.slot);
}

export function getOpenSlotsForBoard(board: BlindRankBoardSlot[]) {
  return board.filter((entry) => entry.movie === null).map((entry) => entry.slot);
}

export function isBoardFilled(state: BlindRankRoomState) {
  return state.board.every((entry) => entry.movie !== null);
}

export function isBoardFilledEntries(board: BlindRankBoardSlot[]) {
  return board.every((entry) => entry.movie !== null);
}

export function getBlindRankFinalScore(state: BlindRankRoomState) {
  if (state.format === "solo-compare") {
    return null;
  }

  return getBoardScore(state.board);
}

export function getBlindRankActualOrder(state: BlindRankRoomState) {
  if (state.format === "solo-compare") {
    return getMoviesInActualOrder(state.soloMovies ?? []);
  }

  return getPlacedMoviesInActualOrder(state.board);
}

export function getSoloCompareBoard(state: BlindRankRoomState, sessionId: string) {
  return state.soloBoards[sessionId] ?? createEmptyBoard(state.slotCount);
}

export function getSoloCompareCurrentMovie(state: BlindRankRoomState, sessionId: string) {
  if (state.format !== "solo-compare" || !state.soloMovies) {
    return null;
  }

  const nextMovieIndex = state.soloNextMovieIndexBySessionId[sessionId] ?? 0;
  return state.soloMovies[nextMovieIndex] ?? null;
}

export function getBestBoardVoteSummary(state: BlindRankRoomState) {
  const counts = state.bestBoardVotes.reduce<Record<string, number>>((summary, vote) => {
    summary[vote.targetSessionId] = (summary[vote.targetSessionId] ?? 0) + 1;
    return summary;
  }, {});

  const ordered = Object.entries(counts)
    .map(([targetSessionId, count]) => ({ targetSessionId, count }))
    .sort((left, right) => right.count - left.count || left.targetSessionId.localeCompare(right.targetSessionId));

  return {
    counts,
    leadingTargetSessionId: ordered[0]?.targetSessionId ?? null,
    leadingVoteCount: ordered[0]?.count ?? 0,
  };
}

export function normalizeBlindRankSlotCount(slotCount: number | null | undefined): number {
  if (slotCount === 5 || slotCount === 10) {
    return slotCount;
  }

  return BLIND_RANK_DEFAULT_SLOT_COUNT;
}

export function normalizeBlindRankFormat(
  format: BlindRankFormat | string | null | undefined,
): BlindRankFormat {
  if (format === "turns" || format === "solo-compare") {
    return format;
  }

  return "vote";
}

function createPlayer(input: {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}): BlindRankPlayer {
  return {
    sessionId: input.sessionId,
    name: input.name,
    isHost: input.isHost,
    joinedAt: input.joinedAt,
    lastSeenAt: input.joinedAt,
  };
}

function createRound(state: BlindRankRoomState, roundNumber: number): BlindRankRound {
  const nextMovie = state.moviePool[state.nextMovieIndex];

  if (!nextMovie) {
    throw new Error("There are no more unseen movies left for this room.");
  }

  state.nextMovieIndex += 1;

  return {
    roundNumber,
    status: "voting",
    eligibleSessionIds: state.players.map((player) => player.sessionId),
    movie: nextMovie,
    chooserSessionId: state.format === "turns" ? getCurrentTurnPlayerSessionId(state) : null,
    votes: [],
    skippedSessionIds: [],
    chosenSlot: null,
  };
}

function createEmptyBoard(slotCount: number): BlindRankBoardSlot[] {
  return Array.from({ length: slotCount }, (_, index) => ({
    slot: index + 1,
    movie: null,
    placedAtRound: null,
  }));
}

function startSoloCompareGame(state: BlindRankRoomState) {
  const soloMovies = state.moviePool.slice(0, state.slotCount);

  if (soloMovies.length < state.slotCount) {
    throw new Error(`You need at least ${state.slotCount} rated movies to start a blind ranking room.`);
  }

  state.nextMovieIndex = state.slotCount;
  state.currentRound = null;
  state.soloMovies = soloMovies;
  state.soloPhase = "ranking";
  state.bestBoardVotes = [];
  state.soloFinishedSessionIds = [];
  state.soloBoards = {};
  state.soloNextMovieIndexBySessionId = {};

  for (const player of state.players) {
    state.soloBoards[player.sessionId] = createEmptyBoard(state.slotCount);
    state.soloNextMovieIndexBySessionId[player.sessionId] = 0;
  }
}

function submitSoloComparePlacement(
  state: BlindRankRoomState,
  input: { sessionId: string; slot: number },
): BlindRankRoomState {
  if (state.soloPhase !== "ranking" || !state.soloMovies) {
    throw new Error("There is no active solo comparison board to update right now.");
  }

  const board = state.soloBoards[input.sessionId];

  if (!board) {
    throw new Error("You joined after solo compare started. Wait for the next room.");
  }

  const nextMovieIndex = state.soloNextMovieIndexBySessionId[input.sessionId] ?? 0;
  const nextMovie = state.soloMovies[nextMovieIndex];

  if (!nextMovie) {
    throw new Error("Your solo board is already complete.");
  }

  const boardEntry = board.find((entry) => entry.slot === input.slot);

  if (!boardEntry || boardEntry.movie) {
    throw new Error("That slot is already locked in.");
  }

  boardEntry.movie = nextMovie;
  boardEntry.placedAtRound = nextMovieIndex + 1;
  state.soloNextMovieIndexBySessionId[input.sessionId] = nextMovieIndex + 1;
  touchPlayer(state, input.sessionId);

  if (isBoardFilledEntries(board) && !state.soloFinishedSessionIds.includes(input.sessionId)) {
    state.soloFinishedSessionIds.push(input.sessionId);
  }

  if (state.soloFinishedSessionIds.length >= getSoloActivePlayerSessionIds(state).length) {
    state.soloPhase = "judging";
  }

  return state;
}

function getCurrentSharedRound(state: BlindRankRoomState, errorMessage: string) {
  const round = state.currentRound;

  if (!round || round.status !== "voting") {
    throw new Error(errorMessage);
  }

  return round;
}

function getCurrentTurnPlayerSessionId(state: BlindRankRoomState) {
  const player = state.players[state.currentTurnIndex % state.players.length];

  if (!player) {
    throw new Error("Add at least one player before starting the game.");
  }

  return player.sessionId;
}

function finalizeBlindRankPlacement(state: BlindRankRoomState, slot: number): BlindRankRoomState {
  const round = state.currentRound;

  if (!round) {
    throw new Error("There is no current movie to place.");
  }

  const boardEntry = state.board.find((entry) => entry.slot === slot);

  if (!boardEntry || boardEntry.movie) {
    throw new Error("That slot is already locked in.");
  }

  boardEntry.movie = round.movie;
  boardEntry.placedAtRound = round.roundNumber;
  round.chosenSlot = slot;
  round.status = "revealed";
  touchPlayer(state, round.chooserSessionId ?? state.hostSessionId);

  if (isBoardFilled(state)) {
    state.status = "finished";
    state.finishedAt = new Date().toISOString();
  }

  return state;
}

function finalizeSkippedBlindRankRound(
  state: BlindRankRoomState,
  sessionId: string,
): BlindRankRoomState {
  const round = state.currentRound;

  if (!round) {
    throw new Error("There is no current movie to skip.");
  }

  round.status = "skipped";
  round.chosenSlot = null;
  touchPlayer(state, sessionId);

  return state;
}

function getBoardScore(board: BlindRankBoardSlot[]) {
  if (!isBoardFilledEntries(board)) {
    return null;
  }

  const placedMovies = board
    .filter((entry): entry is BlindRankBoardSlot & { movie: BlindRankMovie } => entry.movie !== null)
    .sort((left, right) => left.slot - right.slot);
  const actualRanking = [...placedMovies].sort(
    (left, right) =>
      right.movie.rating - left.movie.rating ||
      left.movie.name.localeCompare(right.movie.name) ||
      (left.movie.year ?? 0) - (right.movie.year ?? 0),
  );
  const actualSlotByMovieId = new Map(actualRanking.map((entry, index) => [entry.movie.id, index + 1]));

  return placedMovies.reduce((score, entry) => {
    const idealSlot = actualSlotByMovieId.get(entry.movie.id) ?? entry.slot;
    return score + Math.abs(entry.slot - idealSlot);
  }, 0);
}

function getPlacedMoviesInActualOrder(board: BlindRankBoardSlot[]) {
  return board
    .filter((entry): entry is BlindRankBoardSlot & { movie: BlindRankMovie } => entry.movie !== null)
    .sort(
      (left, right) =>
        right.movie.rating - left.movie.rating ||
        left.movie.name.localeCompare(right.movie.name) ||
        (left.movie.year ?? 0) - (right.movie.year ?? 0),
    );
}

function getMoviesInActualOrder(movies: BlindRankMovie[]) {
  return [...movies].sort(
    (left, right) =>
      right.rating - left.rating ||
      left.name.localeCompare(right.name) ||
      (left.year ?? 0) - (right.year ?? 0),
  );
}

function getSoloActivePlayerSessionIds(state: BlindRankRoomState) {
  return state.players
    .map((player) => player.sessionId)
    .filter((sessionId) => Boolean(state.soloBoards[sessionId]));
}

function getSoloEligibleVoterSessionIds(state: BlindRankRoomState) {
  return getSoloActivePlayerSessionIds(state);
}

function shuffleMovies(movies: BlindRankMovie[]) {
  const shuffledMovies = [...movies];

  for (let index = shuffledMovies.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentMovie = shuffledMovies[index];

    shuffledMovies[index] = shuffledMovies[swapIndex];
    shuffledMovies[swapIndex] = currentMovie;
  }

  return shuffledMovies;
}

function assertHost(state: BlindRankRoomState, sessionId: string) {
  if (state.hostSessionId !== sessionId) {
    throw new Error("Only the host can do that.");
  }
}

function assertPlayer(state: BlindRankRoomState, sessionId: string) {
  if (!state.players.some((player) => player.sessionId === sessionId)) {
    throw new Error("Join the room before playing.");
  }
}

function touchPlayer(state: BlindRankRoomState, sessionId: string) {
  const player = state.players.find((entry) => entry.sessionId === sessionId);

  if (player) {
    player.lastSeenAt = new Date().toISOString();
  }
}
