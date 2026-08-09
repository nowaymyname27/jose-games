export type WavelengthPlayer = {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

export type WavelengthSpectrum = {
  id: string;
  leftLabel: string;
  rightLabel: string;
};

export type WavelengthSpectrumOption = {
  id: string;
  source: "preset" | "custom";
  leftLabel: string | null;
  rightLabel: string | null;
};

export type WavelengthRoundPhase = "choosing-spectrum" | "clue" | "guessing" | "revealed";
export type WavelengthRoomStatus = "setup" | "live";

export type WavelengthGuess = {
  sessionId: string;
  position: number | null;
  points: number | null;
  submittedAt: string;
};

export type WavelengthScoreZone = {
  points: 1 | 2 | 3 | 4;
  start: number;
  end: number;
};

export type WavelengthRound = {
  roundNumber: number;
  phase: WavelengthRoundPhase;
  spectrum: WavelengthSpectrum | null;
  spectrumOptions: WavelengthSpectrumOption[];
  clueGiverSessionId: string;
  clueText: string | null;
  targetPosition: number | null;
  scoreZones: WavelengthScoreZone[];
  eligibleSessionIds: string[];
  guesses: WavelengthGuess[];
  clueGiverPoints: number | null;
  readyForNextRoundSessionIds: string[];
  revealedAt: string | null;
};

export type WavelengthRoomState = {
  title: string;
  hostSessionId: string;
  status: WavelengthRoomStatus;
  players: WavelengthPlayer[];
  scoresBySessionId: Record<string, number>;
  usedSpectrumIds: string[];
  currentRound: WavelengthRound | null;
  createdAt: string;
};

export type WavelengthRoom = {
  code: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  state: WavelengthRoomState;
};
