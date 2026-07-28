import { Suspense } from "react";

import BlindRankGame from "@/components/blind-rank-game";
import SiteMenu from "@/components/site-menu";
import { hasSupabaseServerConfig } from "@/lib/supabase-server";

export default function BlindRankPage() {
  const backendConfigured = hasSupabaseServerConfig();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1550px] flex-col px-4 py-5 sm:px-6 sm:py-10 lg:px-8 xl:px-10">
      <div className="mb-6 flex flex-col gap-4 border-b border-white/8 pb-6 sm:mb-8 sm:gap-5 sm:pb-8">
        <div className="flex justify-end">
          <SiteMenu />
        </div>

        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-300/80 sm:text-xs">
          Jose Games
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Blind Rank
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Place random rated movies into a locked top-5 or top-10 board without seeing the score until after each slot is chosen.
            </p>
          </div>

          <p className="max-w-sm text-sm leading-6 text-slate-400 lg:text-right">
            Shared room voting, one movie at a time, and no moving anything after it is locked in.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-center text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
            Loading blind rank room...
          </div>
        }
      >
        <BlindRankGame backendConfigured={backendConfigured} />
      </Suspense>
    </main>
  );
}
