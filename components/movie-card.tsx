import Image from "next/image";

import type { Movie } from "@/lib/types";
import { formatRating } from "@/lib/ratings";

type MovieCardProps = {
  movie: Movie;
  onSelect: (movie: Movie) => void;
  disabled?: boolean;
  variant?: "default" | "correct" | "wrong" | "missed";
  revealRating?: boolean;
};

export default function MovieCard({
  movie,
  onSelect,
  disabled = false,
  variant = "default",
  revealRating = false,
}: MovieCardProps) {
  const statusLabel =
    variant === "correct"
      ? "Correct"
      : variant === "wrong"
        ? "Not Quite"
        : variant === "missed"
          ? "Higher Rated"
          : "Pick Me";

  const variantClassName = {
    default:
      "border-white/10 bg-white/5 hover:border-amber-300/60 hover:bg-white/10",
    correct:
      "border-emerald-300/60 bg-emerald-400/12 ring-2 ring-emerald-300/50 animate-success-pulse",
    wrong:
      "border-rose-300/60 bg-rose-400/12 ring-2 ring-rose-300/50 animate-failure-shake",
    missed:
      "border-emerald-300/45 bg-emerald-400/8 ring-2 ring-emerald-300/35",
  }[variant];

  return (
    <button
      type="button"
      onClick={() => onSelect(movie)}
      disabled={disabled}
      className={`group flex w-full gap-4 rounded-3xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-70 sm:p-5 md:min-h-56 md:flex-col md:justify-between md:p-6 ${variantClassName}`}
    >
      <div className="relative w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 sm:w-28 md:w-full md:aspect-[2/3]">
        <div className="relative aspect-[2/3] h-full w-full">
          {movie.posterUrl ? (
            <Image
              src={movie.posterUrl}
              alt={`${movie.name} poster`}
              fill
              sizes="(max-width: 767px) 96px, (max-width: 1023px) 112px, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-950 px-4 text-center text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              No Poster
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 md:gap-6">
        <div className="space-y-2 md:space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-300/80 sm:text-xs sm:tracking-[0.24em]">
            {statusLabel}
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl md:text-2xl lg:text-3xl">
            {movie.name}
          </h2>
          <p className="text-sm text-slate-300">
            {movie.year ?? "Unknown year"}
          </p>
          {revealRating ? (
            <div className="inline-flex w-fit rounded-full border border-white/15 bg-slate-950/40 px-3 py-1 text-sm font-semibold text-slate-50">
              Jose&apos;s rating: {formatRating(movie.rating)}
            </div>
          ) : null}
        </div>

        <span className="inline-flex items-center text-sm font-medium text-slate-200 transition group-hover:text-white">
          {revealRating ? "Rating revealed" : "I rated this one higher"}
        </span>
      </div>
    </button>
  );
}
