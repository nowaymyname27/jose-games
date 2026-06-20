type ScoreBoardProps = {
  score: number;
  highScore: number;
};

export default function ScoreBoard({ score, highScore }: ScoreBoardProps) {
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          Score
        </p>
        <p className="mt-1 text-2xl font-semibold text-white sm:mt-2 sm:text-3xl">{score}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          High Score
        </p>
        <p className="mt-1 text-2xl font-semibold text-white sm:mt-2 sm:text-3xl">{highScore}</p>
      </div>
    </div>
  );
}
