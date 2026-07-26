import Image from "next/image";

import type { TournamentMatch, TournamentRoomState } from "@/lib/tournament-types";

type TournamentBracketProps = {
  roomState: TournamentRoomState;
};

type MatchPlacement = {
  match: TournamentMatch | null;
  x: number;
  y: number;
};

type ConnectorSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type PosterBlockSize = "sm" | "md" | "lg";

export default function TournamentBracket({ roomState }: TournamentBracketProps) {
  if (roomState.bracketSize === 4) {
    return <TournamentBracket4 roomState={roomState} />;
  }

  if (roomState.bracketSize === 8) {
    return <TournamentBracket8 roomState={roomState} />;
  }

  return <TournamentBracket16 roomState={roomState} />;
}

function TournamentBracket4({ roomState }: TournamentBracketProps) {
  return (
    <PosterBracketBoard
      roomState={roomState}
      size="lg"
      boardMinWidthClass="min-w-[560px]"
      boardHeightClass="h-[420px] sm:h-[460px]"
      placements={[
        { match: getMatch(roomState, 1, 0), x: 18, y: 50 },
        { match: getMatch(roomState, 2, 0), x: 50, y: 50 },
        { match: getMatch(roomState, 1, 1), x: 82, y: 50 },
      ]}
      connectors={[
        { x1: 27, y1: 50, x2: 41, y2: 50 },
        { x1: 59, y1: 50, x2: 73, y2: 50 },
      ]}
    />
  );
}

function TournamentBracket8({ roomState }: TournamentBracketProps) {
  return (
    <PosterBracketBoard
      roomState={roomState}
      size="md"
      boardMinWidthClass="min-w-[980px]"
      boardHeightClass="h-[560px]"
      placements={[
        { match: getMatch(roomState, 1, 0), x: 9, y: 24 },
        { match: getMatch(roomState, 1, 1), x: 9, y: 76 },
        { match: getMatch(roomState, 2, 0), x: 31, y: 50 },
        { match: getMatch(roomState, 3, 0), x: 50, y: 50 },
        { match: getMatch(roomState, 2, 1), x: 69, y: 50 },
        { match: getMatch(roomState, 1, 2), x: 91, y: 24 },
        { match: getMatch(roomState, 1, 3), x: 91, y: 76 },
      ]}
      connectors={[
        { x1: 15, y1: 24, x2: 21, y2: 24 },
        { x1: 15, y1: 76, x2: 21, y2: 76 },
        { x1: 21, y1: 24, x2: 21, y2: 76 },
        { x1: 21, y1: 50, x2: 25, y2: 50 },
        { x1: 37, y1: 50, x2: 42, y2: 50 },
        { x1: 58, y1: 50, x2: 63, y2: 50 },
        { x1: 79, y1: 24, x2: 85, y2: 24 },
        { x1: 79, y1: 76, x2: 85, y2: 76 },
        { x1: 79, y1: 24, x2: 79, y2: 76 },
        { x1: 75, y1: 50, x2: 79, y2: 50 },
      ]}
    />
  );
}

function TournamentBracket16({ roomState }: TournamentBracketProps) {
  return (
    <PosterBracketBoard
      roomState={roomState}
      size="sm"
      boardMinWidthClass="min-w-[1280px]"
      boardHeightClass="h-[760px]"
      placements={[
        { match: getMatch(roomState, 1, 0), x: 7, y: 13 },
        { match: getMatch(roomState, 1, 1), x: 7, y: 38 },
        { match: getMatch(roomState, 1, 2), x: 7, y: 63 },
        { match: getMatch(roomState, 1, 3), x: 7, y: 88 },
        { match: getMatch(roomState, 2, 0), x: 23, y: 25 },
        { match: getMatch(roomState, 2, 1), x: 23, y: 75 },
        { match: getMatch(roomState, 3, 0), x: 38, y: 50 },
        { match: getMatch(roomState, 4, 0), x: 50, y: 50 },
        { match: getMatch(roomState, 3, 1), x: 62, y: 50 },
        { match: getMatch(roomState, 2, 2), x: 77, y: 25 },
        { match: getMatch(roomState, 2, 3), x: 77, y: 75 },
        { match: getMatch(roomState, 1, 4), x: 93, y: 13 },
        { match: getMatch(roomState, 1, 5), x: 93, y: 38 },
        { match: getMatch(roomState, 1, 6), x: 93, y: 63 },
        { match: getMatch(roomState, 1, 7), x: 93, y: 88 },
      ]}
      connectors={[
        { x1: 11.5, y1: 13, x2: 15, y2: 13 },
        { x1: 11.5, y1: 38, x2: 15, y2: 38 },
        { x1: 15, y1: 13, x2: 15, y2: 38 },
        { x1: 15, y1: 25, x2: 18.5, y2: 25 },
        { x1: 11.5, y1: 63, x2: 15, y2: 63 },
        { x1: 11.5, y1: 88, x2: 15, y2: 88 },
        { x1: 15, y1: 63, x2: 15, y2: 88 },
        { x1: 15, y1: 75, x2: 18.5, y2: 75 },
        { x1: 27.5, y1: 25, x2: 31, y2: 25 },
        { x1: 27.5, y1: 75, x2: 31, y2: 75 },
        { x1: 31, y1: 25, x2: 31, y2: 75 },
        { x1: 31, y1: 50, x2: 34, y2: 50 },
        { x1: 42.5, y1: 50, x2: 45.5, y2: 50 },
        { x1: 54.5, y1: 50, x2: 57.5, y2: 50 },
        { x1: 66, y1: 50, x2: 69, y2: 50 },
        { x1: 72.5, y1: 25, x2: 69, y2: 25 },
        { x1: 72.5, y1: 75, x2: 69, y2: 75 },
        { x1: 69, y1: 25, x2: 69, y2: 75 },
        { x1: 81.5, y1: 25, x2: 85, y2: 25 },
        { x1: 81.5, y1: 75, x2: 85, y2: 75 },
        { x1: 85, y1: 13, x2: 85, y2: 38 },
        { x1: 85, y1: 63, x2: 85, y2: 88 },
        { x1: 88.5, y1: 13, x2: 85, y2: 13 },
        { x1: 88.5, y1: 38, x2: 85, y2: 38 },
        { x1: 88.5, y1: 63, x2: 85, y2: 63 },
        { x1: 88.5, y1: 88, x2: 85, y2: 88 },
      ]}
    />
  );
}

function PosterBracketBoard({
  roomState,
  size,
  boardMinWidthClass,
  boardHeightClass,
  placements,
  connectors,
}: {
  roomState: TournamentRoomState;
  size: PosterBlockSize;
  boardMinWidthClass: string;
  boardHeightClass: string;
  placements: MatchPlacement[];
  connectors: ConnectorSegment[];
}) {
  return (
    <div className="overflow-x-auto">
      <div
        className={`relative mx-auto w-full ${boardMinWidthClass} ${boardHeightClass} rounded-[1.4rem] border border-white/8 bg-[radial-gradient(circle_at_top,_rgba(167,139,250,0.08),_transparent_45%),rgba(2,6,23,0.45)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5`}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {connectors.map((segment, index) => (
            <line
              key={`connector-${index}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="0.65"
              strokeLinecap="round"
            />
          ))}
        </svg>

        {placements.map((placement, index) => (
          <div
            key={`placement-${index}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${placement.x}%`, top: `${placement.y}%` }}
          >
            <PosterMatchBlock
              match={placement.match}
              roomState={roomState}
              size={size}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PosterMatchBlock({
  match,
  roomState,
  size,
}: {
  match: TournamentMatch | null;
  roomState: TournamentRoomState;
  size: PosterBlockSize;
}) {
  const leftEntry = match
    ? roomState.entries.find((entry) => entry.id === match.leftEntryId) ?? null
    : null;
  const rightEntry = match
    ? roomState.entries.find((entry) => entry.id === match.rightEntryId) ?? null
    : null;
  const blockClassName =
    size === "lg"
      ? "w-[122px] sm:w-[138px]"
      : size === "md"
        ? "w-[104px] sm:w-[116px]"
        : "w-[88px] sm:w-[96px]";
  const posterHeightClassName =
    size === "lg"
      ? "h-[86px] sm:h-[96px]"
      : size === "md"
        ? "h-[74px] sm:h-[82px]"
        : "h-[62px] sm:h-[68px]";
  const isCurrent = roomState.currentMatchId === match?.id;

  return (
    <div
      className={`rounded-[1.1rem] border border-white/10 bg-slate-950/55 p-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.28)] backdrop-blur-sm ${blockClassName} ${
        isCurrent ? "ring-2 ring-amber-300/55" : ""
      }`}
    >
      <PosterTile
        title={leftEntry?.label ?? "TBD"}
        posterUrl={leftEntry?.posterUrl}
        isWinner={Boolean(leftEntry && match?.winnerEntryId === leftEntry.id)}
        isLoser={Boolean(
          leftEntry && match?.winnerEntryId && match.winnerEntryId !== leftEntry.id,
        )}
        heightClassName={posterHeightClassName}
      />
      <div className="h-1.5" />
      <PosterTile
        title={rightEntry?.label ?? "TBD"}
        posterUrl={rightEntry?.posterUrl}
        isWinner={Boolean(rightEntry && match?.winnerEntryId === rightEntry.id)}
        isLoser={Boolean(
          rightEntry && match?.winnerEntryId && match.winnerEntryId !== rightEntry.id,
        )}
        heightClassName={posterHeightClassName}
      />
      <span className="sr-only">
        {leftEntry?.label ?? "TBD"} versus {rightEntry?.label ?? "TBD"}
      </span>
    </div>
  );
}

function PosterTile({
  title,
  posterUrl,
  isWinner,
  isLoser,
  heightClassName,
}: {
  title: string;
  posterUrl?: string;
  isWinner: boolean;
  isLoser: boolean;
  heightClassName: string;
}) {
  return (
    <div
      title={title}
      className={`relative overflow-hidden rounded-[0.8rem] border border-white/10 bg-slate-900/80 ${heightClassName} ${
        isWinner
          ? "ring-2 ring-emerald-300/60"
          : isLoser
            ? "opacity-45 saturate-50"
            : ""
      }`}
    >
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt={`${title} poster`}
          fill
          sizes="(max-width: 640px) 96px, 120px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-950 px-2 text-center text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">
          TBD
        </div>
      )}
    </div>
  );
}

function getMatch(
  roomState: TournamentRoomState,
  roundNumber: number,
  slotIndex: number,
) {
  return (
    roomState.matches.find(
      (match) =>
        match.roundNumber === roundNumber && match.slotIndex === slotIndex,
    ) ?? null
  );
}
