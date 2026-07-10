import MovieGame from "@/components/movie-game";
import SiteMenu from "@/components/site-menu";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-8 sm:py-12">
      <div className="mb-6 space-y-3 sm:mb-10 sm:space-y-4">
        <div className="flex justify-end">
          <SiteMenu />
        </div>

        <div className="text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-300/90 sm:text-sm sm:tracking-[0.25em]">
            Jose Games
          </p>
          <div className="mt-2 space-y-2 sm:mt-3 sm:space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-5xl">
              Which Movie Did Jose Rate Higher?
            </h1>
          </div>
        </div>
      </div>

      <MovieGame />
    </main>
  );
}
