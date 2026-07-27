export type D20Player = {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

export type D20Roll = {
  sessionId: string;
  value: number;
  rolledAt: string;
};

export type D20RoundStatus = "waiting" | "complete";

export type D20Round = {
  roundNumber: number;
  status: D20RoundStatus;
  eligibleSessionIds: string[];
  rolls: D20Roll[];
  highestRoll: number | null;
  winnerSessionIds: string[];
};

export type D20RoomState = {
  title: string;
  hostSessionId: string;
  players: D20Player[];
  currentRound: D20Round;
  createdAt: string;
};

export type D20Room = {
  code: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  state: D20RoomState;
};
