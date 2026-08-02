import Image from "next/image";

import type { GuessWhoCardState, GuessWhoEntry } from "@/lib/guess-who-types";

type GuessWhoCardProps = {
  entry: GuessWhoEntry;
  state: GuessWhoCardState;
  isSelected: boolean;
  onToggleEliminated: () => void;
  onToggleSelected: () => void;
  interactive?: boolean;
};

export default function GuessWhoCard({
  entry,
  state,
  isSelected,
  onToggleEliminated,
  onToggleSelected,
  interactive = true,
}: GuessWhoCardProps) {
  const initials = entry.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  const cardClassName =
    state === "eliminated"
      ? "border-red-950/80 bg-[#1b0c0f] opacity-50"
      : isSelected
        ? "border-red-500/70 bg-[#2a0e12] ring-1 ring-red-400/40"
        : "border-white/10 bg-[#121011] hover:border-red-700/55 hover:bg-[#180a0d]";

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onToggleEliminated : undefined}
      onKeyDown={(event) => {
        if (!interactive) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleEliminated();
        }
      }}
      className={`group relative flex w-full flex-col overflow-hidden rounded-[0.95rem] border text-left transition duration-150 ${cardClassName}`}
      aria-pressed={state === "eliminated"}
    >
      <div className="relative aspect-[7/8] w-full border-b border-white/8 bg-slate-900/70">
        {entry.imageUrl ? (
          <Image
            src={entry.imageUrl}
            alt={entry.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1440px) 20vw, 16vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-linear-to-br from-[#13080a] via-[#1d0b0f] to-[#12080a] px-3 text-center">
            <div>
              <p className="text-3xl font-semibold tracking-[0.2em] text-slate-100">{initials}</p>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                Add Driver Image
              </p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-slate-950/70 to-transparent" />

        {interactive ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelected();
            }}
            className={`absolute right-2 top-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-sm transition sm:right-3 sm:top-3 ${
              isSelected
                ? "border-red-300/70 bg-red-500/90 text-white"
                : "border-white/12 bg-slate-950/75 text-slate-200 hover:border-red-500/40"
            }`}
            aria-pressed={isSelected}
          >
            {isSelected ? "My Pick" : "Pick"}
          </button>
        ) : null}

        {state === "eliminated" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45">
            <div className="h-1 w-[140%] rotate-[-28deg] bg-red-400/80 shadow-[0_0_12px_rgba(248,113,113,0.35)]" />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 px-2.5 py-2.5">
        <div>
          <p className="text-[13px] font-semibold tracking-tight text-white sm:text-sm">{entry.name}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
            {state === "eliminated" ? "Marked out" : isSelected ? "Secret character" : "Still in play"}
          </p>
        </div>

        <span className="text-[10px] font-medium text-slate-400 transition group-hover:text-white">
          {interactive ? (state === "eliminated" ? "Undo" : "Cross off") : "Viewing"}
        </span>
      </div>
    </div>
  );
}
