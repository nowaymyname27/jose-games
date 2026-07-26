import { Suspense } from "react";

import SiteMenu from "@/components/site-menu";
import TournamentGame from "@/components/tournament-game";
import { hasSupabaseServerConfig } from "@/lib/supabase-server";

export default function TournamentPage() {
  const backendConfigured = hasSupabaseServerConfig();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1550px] flex-col px-4 py-5 sm:px-6 sm:py-10 lg:px-8 xl:px-10">
      <div className="mb-6 flex flex-col gap-4 border-b border-white/8 pb-6 sm:mb-8 sm:gap-5 sm:pb-8">
        <div className="flex justify-end">
          <SiteMenu />
        </div>

        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-violet-300/80 sm:text-xs">
          Jose Games
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Tournament Lobby
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Create a shared bracket, invite the room, vote matchup by matchup, and let the host settle deadlocked rounds.
            </p>
          </div>

          <p className="max-w-sm text-sm leading-6 text-slate-400 lg:text-right">
            First version: manual 4, 8, or 16-entry brackets with shared room codes and live vote syncing.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-center text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            Loading tournament lobby...
          </div>
        }
      >
        <TournamentGame backendConfigured={backendConfigured} />
      </Suspense>
    </main>
  );
}
