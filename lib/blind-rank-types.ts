export type BlindRankPlayer = {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

export type BlindRankMovie = {
  id: string;
  name: string;
  year: number | null;
  rating: number;
  posterUrl?: string;
};

export type BlindRankVote = {
  sessionId: string;
  slot: number;
  submittedAt: string;
};

export type BlindRankFormat = "vote" | "turns" | "solo-compare";

export type BlindRankSoloPhase = "ranking" | "judging";

export type BlindRankBestBoardVote = {
  sessionId: string;
  targetSessionId: string;
  submittedAt: string;
};

export type BlindRankRoundStatus = "voting" | "tie" | "revealed" | "skipped";
export type BlindRankRoomStatus = "setup" | "live" | "finished";

export type BlindRankRound = {
  roundNumber: number;
  status: BlindRankRoundStatus;
  eligibleSessionIds: string[];
  movie: BlindRankMovie;
  chooserSessionId: string | null;
  votes: BlindRankVote[];
  skippedSessionIds: string[];
  chosenSlot: number | null;
};

export type BlindRankBoardSlot = {
  slot: number;
  movie: BlindRankMovie | null;
  placedAtRound: number | null;
};

export type BlindRankRoomState = {
  title: string;
  slotCount: number;
  format: BlindRankFormat;
  status: BlindRankRoomStatus;
  hostSessionId: string;
  players: BlindRankPlayer[];
  moviePool: BlindRankMovie[];
  nextMovieIndex: number;
  currentTurnIndex: number;
  board: BlindRankBoardSlot[];
  currentRound: BlindRankRound | null;
  soloMovies: BlindRankMovie[] | null;
  soloBoards: Record<string, BlindRankBoardSlot[]>;
  soloNextMovieIndexBySessionId: Record<string, number>;
  soloFinishedSessionIds: string[];
  soloPhase: BlindRankSoloPhase | null;
  bestBoardVotes: BlindRankBestBoardVote[];
  createdAt: string;
  finishedAt: string | null;
};

export type BlindRankRoom = {
  code: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  state: BlindRankRoomState;
};
