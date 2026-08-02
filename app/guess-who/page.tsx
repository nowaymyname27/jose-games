import { Suspense } from "react";

import GuessWhoGame from "@/components/guess-who-game";
import SiteMenu from "@/components/site-menu";
import { getGuessWhoCatalog } from "@/lib/guess-who-catalog";
import { hasSupabaseServerConfig } from "@/lib/supabase-server";

export default function GuessWhoPage() {
  const catalog = getGuessWhoCatalog();
  const backendConfigured = hasSupabaseServerConfig();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1550px] flex-col px-4 py-5 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
      <div className="mb-5 flex flex-col gap-3 border-b border-white/8 pb-5 sm:mb-7 sm:gap-4 sm:pb-6">
        <div className="flex justify-end">
          <SiteMenu />
        </div>

        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-red-300/80 sm:text-xs">
          Jose Games
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-4xl xl:text-[3.2rem]">
              Guess Who?
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Choose a category, generate the same board with a shared seed, keep your secret pick private, and now run host-controlled multiplayer rooms with spectator support.
            </p>
          </div>

          <p className="max-w-sm text-sm leading-6 text-slate-400 lg:text-right">
            Shared seed practice locally, or open a room so two players can play while everyone else watches.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="rounded-[1.25rem] border border-red-950/60 bg-[#18090b] p-6 text-center text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-8">
            Loading board...
          </div>
        }
      >
        <GuessWhoGame catalog={catalog} backendConfigured={backendConfigured} />
      </Suspense>
    </main>
  );
}
