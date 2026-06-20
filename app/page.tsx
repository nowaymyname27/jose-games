import MovieGame from "@/components/movie-game";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-8 sm:py-12">
      <div className="mb-6 space-y-2 text-center sm:mb-10 sm:space-y-4 sm:text-left">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-300/90 sm:text-sm sm:tracking-[0.25em]">
          Jose Games
        </p>
        <div className="space-y-2 sm:space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-5xl">
            Which Movie Did Jose Rate Higher?
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-5 text-slate-300 sm:mx-0 sm:max-w-2xl sm:text-lg">
            A fast movie guessing game powered by Jose&apos;s Letterboxd ratings.
          </p>
        </div>
      </div>

      <MovieGame />
    </main>
  );
}
