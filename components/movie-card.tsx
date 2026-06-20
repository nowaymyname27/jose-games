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
      className={`group flex min-h-56 w-full flex-col justify-between rounded-3xl border p-6 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${variantClassName}`}
    >
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-300/80">
          {variant === "correct"
            ? "Correct"
            : variant === "wrong"
              ? "Not Quite"
              : variant === "missed"
                ? "Higher Rated"
                : "Pick Me"}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
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

      <span className="mt-8 inline-flex items-center text-sm font-medium text-slate-200 transition group-hover:text-white">
        {revealRating ? "Rating revealed" : "I rated this one higher"}
      </span>
    </button>
  );
}
