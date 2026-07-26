export const VALID_BRACKET_SIZES = [4, 8, 16] as const;

export type BracketSize = (typeof VALID_BRACKET_SIZES)[number];

export type TournamentRoomStatus = "setup" | "live" | "finished";
export type TournamentMatchStatus = "pending" | "voting" | "tie" | "complete";

export type TournamentPlayer = {
  sessionId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

export type TournamentEntry = {
  id: string;
  label: string;
  seed: number;
  year?: number | null;
  posterUrl?: string;
  tmdbId?: number;
};

export type TournamentVote = {
  sessionId: string;
  entryId: string;
  submittedAt: string;
};

export type TournamentMatch = {
  id: string;
  roundNumber: number;
  slotIndex: number;
  leftEntryId: string | null;
  rightEntryId: string | null;
  winnerEntryId: string | null;
  status: TournamentMatchStatus;
  votes: TournamentVote[];
  closedAt: string | null;
};

export type TournamentRoomState = {
  title: string;
  status: TournamentRoomStatus;
  bracketSize: BracketSize;
  hostSessionId: string;
  players: TournamentPlayer[];
  entries: TournamentEntry[];
  matches: TournamentMatch[];
  currentMatchId: string | null;
  winnerEntryId: string | null;
  createdAt: string;
};

export type TournamentRoom = {
  code: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  state: TournamentRoomState;
};
