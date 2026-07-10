import type { GuessWhoCategory } from "@/lib/guess-who-types";

type GuessWhoControlsProps = {
  categoryOptions: GuessWhoCategory[];
  draftCategoryId: GuessWhoCategory["id"];
  sizeOptions: number[];
  draftSize: number;
  draftSeed: string;
  onDraftCategoryChange: (value: GuessWhoCategory["id"]) => void;
  onDraftSizeChange: (value: number) => void;
  onDraftSeedChange: (value: string) => void;
  onRandomizeSeed: () => void;
  onLoadBoard: () => void;
  onCopyLink: () => void;
  copyStatus: string | null;
};

export default function GuessWhoControls({
  categoryOptions,
  draftCategoryId,
  sizeOptions,
  draftSize,
  draftSeed,
  onDraftCategoryChange,
  onDraftSizeChange,
  onDraftSeedChange,
  onRandomizeSeed,
  onLoadBoard,
  onCopyLink,
  copyStatus,
}: GuessWhoControlsProps) {
  return (
    <div className="rounded-[1.1rem] border border-red-950/70 bg-[#12080a]/95 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_130px] xl:grid-cols-[220px_130px_minmax(0,1fr)]">
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
              Category
            </p>
            <select
              value={draftCategoryId}
              onChange={(event) => onDraftCategoryChange(event.target.value as GuessWhoCategory["id"])}
              className="w-full rounded-[0.9rem] border border-red-950/60 bg-[#1a0a0d] px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-red-500/60 sm:text-base"
            >
              {categoryOptions.map((categoryOption) => (
                <option key={categoryOption.id} value={categoryOption.id}>
                  {categoryOption.label}
                </option>
              ))}
            </select>
          </div>

          <label className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
              Board Size
            </span>
            <select
              value={draftSize}
              onChange={(event) => onDraftSizeChange(Number(event.target.value))}
              className="w-full rounded-[0.9rem] border border-red-950/60 bg-[#1a0a0d] px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-red-500/60"
            >
              {sizeOptions.map((sizeOption) => (
                <option key={sizeOption} value={sizeOption}>
                  {sizeOption} characters
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 sm:text-xs">
              Seed
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={draftSeed}
                onChange={(event) => onDraftSeedChange(event.target.value)}
                placeholder="Enter a shared seed"
                className="min-w-0 flex-1 rounded-[0.9rem] border border-red-950/60 bg-[#1a0a0d] px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-red-500/60"
              />
              <button
                type="button"
                onClick={onRandomizeSeed}
                className="rounded-[0.9rem] border border-red-950/70 bg-[#210d10] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-red-800/70 hover:bg-[#2b1014]"
              >
                Random Seed
              </button>
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-3 xl:min-w-[320px] xl:max-w-[360px] xl:items-end">
          <div className="rounded-full border border-red-900/50 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-red-100">
            Shared Seed Board
          </div>
          <p className="text-sm leading-5 text-slate-400 xl:text-right">
            Share the same seed and board size to get the exact same board on every device.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row xl:w-full xl:justify-end">
            <button
              type="button"
              onClick={onLoadBoard}
              className="rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
            >
              Load Board
            </button>
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-full border border-red-900/60 bg-[#190b0d] px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-red-700/70 hover:bg-[#241012]"
            >
              Copy Link
            </button>
          </div>
        </div>
      </div>

      {copyStatus ? <p className="mt-3 text-sm text-red-100">{copyStatus}</p> : null}
    </div>
  );
}
