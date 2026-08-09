import {
  createRoomCode,
  normalizeDisplayName,
  normalizeRoomCode,
  normalizeRoomTitle,
} from "@/lib/tournament";
import type {
  WavelengthGuess,
  WavelengthPlayer,
  WavelengthRoom,
  WavelengthRoomState,
  WavelengthScoreZone,
  WavelengthSpectrumOption,
  WavelengthSpectrum,
} from "@/lib/wavelength-types";

export { createRoomCode, normalizeDisplayName, normalizeRoomCode, normalizeRoomTitle };

const WAVELENGTH_SPECTRUMS: WavelengthSpectrum[] = [
  { id: "salty-sweet", leftLabel: "Salty", rightLabel: "Sweet" },
  { id: "cheap-expensive", leftLabel: "Cheap", rightLabel: "Expensive" },
  { id: "formal-casual", leftLabel: "Formal", rightLabel: "Casual" },
  { id: "hot-cold", leftLabel: "Hot", rightLabel: "Cold" },
  { id: "safe-dangerous", leftLabel: "Safe", rightLabel: "Dangerous" },
  { id: "boring-exciting", leftLabel: "Boring", rightLabel: "Exciting" },
  { id: "soft-hard", leftLabel: "Soft", rightLabel: "Hard" },
  { id: "healthy-unhealthy", leftLabel: "Healthy", rightLabel: "Unhealthy" },
  { id: "easy-hard", leftLabel: "Easy", rightLabel: "Hard" },
  { id: "cute-scary", leftLabel: "Cute", rightLabel: "Scary" },
  { id: "clean-dirty", leftLabel: "Clean", rightLabel: "Dirty" },
  { id: "quiet-loud", leftLabel: "Quiet", rightLabel: "Loud" },
  { id: "basic-fancy", leftLabel: "Basic", rightLabel: "Fancy" },
  { id: "rare-common", leftLabel: "Rare", rightLabel: "Common" },
  { id: "serious-funny", leftLabel: "Serious", rightLabel: "Funny" },
  { id: "weak-strong", leftLabel: "Weak", rightLabel: "Strong" },
];

export function createWavelengthRoomState(input: {
  title: string;
  hostSessionId: string;
  hostName: string;
}): WavelengthRoomState {
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
    status: "setup",
    players: [
      createPlayer({
        sessionId: input.hostSessionId,
        name: hostName,
        isHost: true,
        joinedAt: createdAt,
      }),
    ],
    scoresBySessionId: {
      [input.hostSessionId]: 0,
    },
    usedSpectrumIds: [],
    currentRound: null,
    createdAt,
  };
}

export function upsertWavelengthPlayer(
  state: WavelengthRoomState,
  input: { sessionId: string; name: string },
): WavelengthRoomState {
  const nextTimestamp = new Date().toISOString();
  const normalizedName = normalizeDisplayName(input.name);

  if (!normalizedName) {
    throw new Error("Add your display name before joining.");
  }

  const existingPlayer = state.players.find((player) => player.sessionId === input.sessionId);

  if (existingPlayer) {
    existingPlayer.name = normalizedName;
    existingPlayer.lastSeenAt = nextTimestamp;
  } else {
    state.players.push(
      createPlayer({
        sessionId: input.sessionId,
        name: normalizedName,
        isHost: state.hostSessionId === input.sessionId,
        joinedAt: nextTimestamp,
      }),
    );
  }

  state.scoresBySessionId[input.sessionId] ??= 0;
  touchPlayer(state, input.sessionId);
  return state;
}

export function startWavelengthGame(
  state: WavelengthRoomState,
  sessionId: string,
): WavelengthRoomState {
  assertHost(state, sessionId);

  if (state.players.length < 2) {
    throw new Error("You need at least 2 players to start Wavelength.");
  }

  if (state.status !== "setup") {
    throw new Error("This room has already started.");
  }

  state.status = "live";
  state.currentRound = createNextRound(state, 1);
  touchPlayer(state, sessionId);
  return state;
}

export function submitWavelengthClue(
  state: WavelengthRoomState,
  input: { sessionId: string; clueText: string },
): WavelengthRoomState {
  assertPlayer(state, input.sessionId);
  const round = getActiveRound(state);

  if (round.phase !== "clue") {
    throw new Error("This round is not waiting for a clue.");
  }

  if (round.clueGiverSessionId !== input.sessionId) {
    throw new Error("Only the clue-giver can submit the clue.");
  }

  const clueText = normalizeClueText(input.clueText);

  if (!clueText) {
    throw new Error("Add a clue before submitting.");
  }

  round.clueText = clueText;
  round.phase = "guessing";
  touchPlayer(state, input.sessionId);
  return state;
}

export function selectWavelengthSpectrum(
  state: WavelengthRoomState,
  input: {
    sessionId: string;
    optionId: string;
    customLeftLabel?: string;
    customRightLabel?: string;
  },
): WavelengthRoomState {
  assertPlayer(state, input.sessionId);
  const round = getActiveRound(state);

  if (round.phase !== "choosing-spectrum") {
    throw new Error("This round is not waiting for a spectrum choice.");
  }

  if (round.clueGiverSessionId !== input.sessionId) {
    throw new Error("Only the clue-giver can choose the spectrum.");
  }

  const selectedOption = round.spectrumOptions.find((option) => option.id === input.optionId) ?? null;

  if (!selectedOption) {
    throw new Error("Choose one of the available spectrum options.");
  }

  if (selectedOption.source === "custom") {
    const leftLabel = normalizeSpectrumLabel(input.customLeftLabel);
    const rightLabel = normalizeSpectrumLabel(input.customRightLabel);

    if (!leftLabel || !rightLabel) {
      throw new Error("Add both sides of your custom spectrum.");
    }

    if (leftLabel.toLowerCase() === rightLabel.toLowerCase()) {
      throw new Error("Make the two sides of the spectrum different.");
    }

    round.spectrum = {
      id: `custom-${round.roundNumber}`,
      leftLabel,
      rightLabel,
    };
  } else {
    round.spectrum = {
      id: selectedOption.id,
      leftLabel: selectedOption.leftLabel ?? "Left",
      rightLabel: selectedOption.rightLabel ?? "Right",
    };

    if (!state.usedSpectrumIds.includes(selectedOption.id)) {
      state.usedSpectrumIds.push(selectedOption.id);
    }
  }

  round.phase = "clue";
  touchPlayer(state, input.sessionId);
  return state;
}

export function submitWavelengthGuess(
  state: WavelengthRoomState,
  input: { sessionId: string; position: number },
): WavelengthRoomState {
  assertPlayer(state, input.sessionId);
  const round = getActiveRound(state);

  if (round.phase !== "guessing") {
    throw new Error("This round is not accepting guesses right now.");
  }

  if (!round.eligibleSessionIds.includes(input.sessionId)) {
    throw new Error("The clue-giver cannot submit a guess this round.");
  }

  const position = normalizeSpectrumPosition(input.position);
  const existingGuess = round.guesses.find((guess) => guess.sessionId === input.sessionId);

  if (existingGuess) {
    existingGuess.position = position;
    existingGuess.submittedAt = new Date().toISOString();
  } else {
    round.guesses.push({
      sessionId: input.sessionId,
      position,
      points: null,
      submittedAt: new Date().toISOString(),
    });
  }

  touchPlayer(state, input.sessionId);

  if (round.guesses.length >= round.eligibleSessionIds.length) {
    revealWavelengthRound(state);
  }

  return state;
}

export function toggleReadyForNextWavelengthRound(
  state: WavelengthRoomState,
  sessionId: string,
): WavelengthRoomState {
  assertPlayer(state, sessionId);
  const currentRound = getActiveRound(state);

  if (currentRound.phase !== "revealed") {
    throw new Error("Reveal the current round before getting ready for the next one.");
  }

  if (state.players.length < 2) {
    throw new Error("You need at least 2 players to continue Wavelength.");
  }

  if (currentRound.readyForNextRoundSessionIds.includes(sessionId)) {
    currentRound.readyForNextRoundSessionIds = currentRound.readyForNextRoundSessionIds.filter(
      (entry) => entry !== sessionId,
    );
  } else {
    currentRound.readyForNextRoundSessionIds.push(sessionId);
  }

  touchPlayer(state, sessionId);

  const allPlayersReady = state.players.every((player) =>
    currentRound.readyForNextRoundSessionIds.includes(player.sessionId),
  );

  if (!allPlayersReady) {
    return state;
  }

  state.currentRound = createNextRound(state, currentRound.roundNumber + 1);
  return state;
}

export function getSpectrumPositionLabel(position: number) {
  return `${Math.round(normalizeSpectrumPosition(position))}%`;
}

export function getSubmittedGuessCount(round: WavelengthRoomState["currentRound"]) {
  return round?.guesses.length ?? 0;
}

export function serializeWavelengthRoomForSession(
  room: WavelengthRoom,
  sessionId: string | null | undefined,
): WavelengthRoom {
  const viewerSessionId = sessionId?.trim() || null;
  const clone = structuredClone(room);
  const round = clone.state.currentRound;

  if (!round) {
    return clone;
  }

  const viewerIsClueGiver = viewerSessionId === round.clueGiverSessionId;

  if (round.phase !== "revealed" && !viewerIsClueGiver) {
    round.targetPosition = null;
    round.scoreZones = [];
  }

  if (round.phase === "choosing-spectrum" && !viewerIsClueGiver) {
    round.spectrumOptions = [];
  }

  if (round.phase === "guessing") {
    round.guesses = round.guesses.map((guess) =>
      guess.sessionId === viewerSessionId
        ? guess
        : {
            ...guess,
            position: null,
            points: null,
          },
    );
  }

  return clone;
}

function createPlayer(input: {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}): WavelengthPlayer {
  return {
    sessionId: input.sessionId,
    name: input.name,
    isHost: input.isHost,
    joinedAt: input.joinedAt,
    lastSeenAt: input.joinedAt,
  };
}

function createNextRound(state: WavelengthRoomState, roundNumber: number) {
  const clueGiverSessionId = chooseNextClueGiverSessionId(state);
  const targetPosition = createTargetPosition();

  return {
    roundNumber,
    phase: "choosing-spectrum" as const,
    spectrum: null,
    spectrumOptions: createSpectrumOptions(state),
    clueGiverSessionId,
    clueText: null,
    targetPosition,
    scoreZones: createScoreZones(targetPosition),
    eligibleSessionIds: state.players
      .map((player) => player.sessionId)
      .filter((sessionId) => sessionId !== clueGiverSessionId),
    guesses: [],
    clueGiverPoints: null,
    readyForNextRoundSessionIds: [],
    revealedAt: null,
  };
}

function chooseNextClueGiverSessionId(state: WavelengthRoomState) {
  const currentClueGiverSessionId = state.currentRound?.clueGiverSessionId ?? null;
  const eligiblePlayers = state.players.filter(
    (player) => player.sessionId !== currentClueGiverSessionId,
  );
  const pool = eligiblePlayers.length > 0 ? eligiblePlayers : state.players;

  return pool[Math.floor(Math.random() * pool.length)]?.sessionId ?? state.hostSessionId;
}

function createSpectrumOptions(state: WavelengthRoomState): WavelengthSpectrumOption[] {
  let availableSpectrums = WAVELENGTH_SPECTRUMS.filter(
    (spectrum) => !state.usedSpectrumIds.includes(spectrum.id),
  );

  if (availableSpectrums.length < 2) {
    state.usedSpectrumIds = [];
    availableSpectrums = [...WAVELENGTH_SPECTRUMS];
  }

  const presetOptions = shuffleSpectrums(availableSpectrums).slice(0, 2).map((spectrum) => ({
    id: spectrum.id,
    source: "preset" as const,
    leftLabel: spectrum.leftLabel,
    rightLabel: spectrum.rightLabel,
  }));

  return [
    ...presetOptions,
    {
      id: "custom",
      source: "custom",
      leftLabel: null,
      rightLabel: null,
    },
  ];
}

function createTargetPosition() {
  return Math.floor(Math.random() * 101);
}

function normalizeClueText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
}

function normalizeSpectrumLabel(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 40) ?? "";
}

function normalizeSpectrumPosition(value: number) {
  if (Number.isNaN(value)) {
    return 50;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function revealWavelengthRound(state: WavelengthRoomState) {
  const round = getActiveRound(state);

  if (round.targetPosition === null) {
    throw new Error("This round is missing its hidden target.");
  }

  round.phase = "revealed";
  round.revealedAt = new Date().toISOString();
  const guesserScores: number[] = [];

  round.guesses.forEach((guess) => {
    const position = guess.position;

    if (position === null) {
      return;
    }

    const points = scoreGuess(position, round.scoreZones);
    guess.points = points;
    guesserScores.push(points);
    state.scoresBySessionId[guess.sessionId] = (state.scoresBySessionId[guess.sessionId] ?? 0) + points;
  });

  const clueGiverPoints = getClueGiverPoints(guesserScores);
  round.clueGiverPoints = clueGiverPoints;
  state.scoresBySessionId[round.clueGiverSessionId] =
    (state.scoresBySessionId[round.clueGiverSessionId] ?? 0) + clueGiverPoints;
}

function scoreGuess(position: number, scoreZones: WavelengthScoreZone[]) {
  const matchingZone = [...scoreZones]
    .sort((left, right) => right.points - left.points)
    .find((zone) => position >= zone.start && position <= zone.end);

  return matchingZone?.points ?? 0;
}

function createScoreZones(targetPosition: number): WavelengthScoreZone[] {
  return [
    createScoreZone(4, targetPosition, 2),
    createScoreZone(3, targetPosition, 6),
    createScoreZone(2, targetPosition, 10),
    createScoreZone(1, targetPosition, 16),
  ];
}

function createScoreZone(points: 1 | 2 | 3 | 4, targetPosition: number, radius: number): WavelengthScoreZone {
  return {
    points,
    start: normalizeSpectrumPosition(targetPosition - radius),
    end: normalizeSpectrumPosition(targetPosition + radius),
  };
}

function getClueGiverPoints(guesserScores: number[]) {
  if (guesserScores.length === 0) {
    return 1;
  }

  const sortedScores = [...guesserScores].sort((left, right) => left - right);
  const middleIndex = Math.floor((sortedScores.length - 1) / 2);
  const medianScore = sortedScores[middleIndex] ?? 0;

  return Math.min(4, medianScore + 1);
}

function shuffleSpectrums(spectrums: WavelengthSpectrum[]) {
  const nextSpectrums = [...spectrums];

  for (let index = nextSpectrums.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const currentValue = nextSpectrums[index];
    nextSpectrums[index] = nextSpectrums[randomIndex] as WavelengthSpectrum;
    nextSpectrums[randomIndex] = currentValue as WavelengthSpectrum;
  }

  return nextSpectrums;
}

function getActiveRound(state: WavelengthRoomState) {
  if (state.status !== "live" || !state.currentRound) {
    throw new Error("There is no live Wavelength round right now.");
  }

  return state.currentRound;
}

function assertHost(state: WavelengthRoomState, sessionId: string) {
  if (state.hostSessionId !== sessionId) {
    throw new Error("Only the host can do that.");
  }
}

function assertPlayer(state: WavelengthRoomState, sessionId: string) {
  if (!state.players.some((player) => player.sessionId === sessionId)) {
    throw new Error("Join the room before taking a turn.");
  }
}

function touchPlayer(state: WavelengthRoomState, sessionId: string) {
  const player = state.players.find((entry) => entry.sessionId === sessionId);

  if (player) {
    player.lastSeenAt = new Date().toISOString();
  }
}

export function getWavelengthScoreboard(roomState: WavelengthRoomState) {
  return roomState.players
    .map((player) => ({
      player,
      score: roomState.scoresBySessionId[player.sessionId] ?? 0,
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.player.isHost !== right.player.isHost) {
        return left.player.isHost ? -1 : 1;
      }

      return Date.parse(left.player.joinedAt) - Date.parse(right.player.joinedAt);
    });
}

export function getCurrentViewerGuess(round: WavelengthRoomState["currentRound"], sessionId: string) {
  return round?.guesses.find((guess) => guess.sessionId === sessionId) ?? null;
}

export function getRoundResults(roomState: WavelengthRoomState) {
  const round = roomState.currentRound;

  if (!round || round.phase !== "revealed") {
    return [] as Array<{
      guess: WavelengthGuess;
      player: WavelengthPlayer;
      distance: number;
    }>;
  }

  return round.guesses
    .map((guess) => {
      const player = roomState.players.find((entry) => entry.sessionId === guess.sessionId) ?? null;

      if (!player || guess.position === null || round.targetPosition === null) {
        return null;
      }

      return {
        guess,
        player,
        distance: Math.abs(guess.position - round.targetPosition),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      if ((right.guess.points ?? 0) !== (left.guess.points ?? 0)) {
        return (right.guess.points ?? 0) - (left.guess.points ?? 0);
      }

      return left.distance - right.distance;
    });
}

export function getClueGiverResult(roomState: WavelengthRoomState) {
  const round = roomState.currentRound;

  if (!round || round.phase !== "revealed") {
    return null;
  }

  const clueGiver = roomState.players.find((entry) => entry.sessionId === round.clueGiverSessionId) ?? null;

  if (!clueGiver) {
    return null;
  }

  const guesserScores = round.guesses
    .map((guess) => guess.points)
    .filter((points): points is number => points !== null)
    .sort((left, right) => left - right);
  const medianIndex = guesserScores.length > 0 ? Math.floor((guesserScores.length - 1) / 2) : null;
  const medianScore = medianIndex === null ? 0 : (guesserScores[medianIndex] ?? 0);

  return {
    player: clueGiver,
    points: round.clueGiverPoints ?? getClueGiverPoints(guesserScores),
    medianScore,
  };
}
