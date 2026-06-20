type ScoreBoardProps = {
  score: number;
  highScore: number;
};

export default function ScoreBoard({ score, highScore }: ScoreBoardProps) {
  return (
    <div className="grid w-full grid-cols-2 gap-2.5 sm:gap-3">
      <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-3 sm:rounded-2xl sm:p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">
          Score
        </p>
        <p className="mt-1 text-xl font-semibold text-white sm:mt-2 sm:text-3xl">{score}</p>
      </div>

      <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-3 sm:rounded-2xl sm:p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">
          High Score
        </p>
        <p className="mt-1 text-xl font-semibold text-white sm:mt-2 sm:text-3xl">{highScore}</p>
      </div>
    </div>
  );
}
