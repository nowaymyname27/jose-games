import MovieGame from "@/components/movie-game";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-8 sm:py-12">
      <div className="mb-8 space-y-3 text-center sm:mb-10 sm:space-y-4 sm:text-left">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-amber-300/90">
          Jose Games
        </p>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Which Movie Did Jose Rate Higher?
          </h1>
          <p className="max-w-2xl text-sm text-slate-300 sm:text-lg">
            A fast movie guessing game powered by Jose&apos;s Letterboxd ratings.
          </p>
        </div>
      </div>

      <MovieGame />
    </main>
  );
}
