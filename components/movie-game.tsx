"use client";

import { useEffect, useRef, useState } from "react";

import MovieCard from "@/components/movie-card";
import ScoreBoard from "@/components/score-board";
import { loadMovies } from "@/lib/csv";
import {
  getCorrectChoice,
  getHigherRatedMovie,
  getRandomPair,
  isCorrectGuess,
} from "@/lib/game";
import { getMovieKey } from "@/lib/movie-key";
import { formatRating } from "@/lib/ratings";
import { readHighScore, writeHighScore } from "@/lib/storage";
import type { GameMode, GuessChoice, Movie, MoviePair } from "@/lib/types";

const ROUND_EXIT_DURATION_MS = 140;
const ROUND_ENTER_DURATION_MS = 180;

type RoundTransition = "idle" | "exiting" | "entering";
type RoundEndReason = "wrong" | "exhausted" | null;

function getModeRules(mode: GameMode) {
  return mode === "classic"
    ? {
        allowEqualRatings: false,
        maxRatingDifference: null,
      }
    : {
        allowEqualRatings: true,
        maxRatingDifference: 1,
      };
}

export default function MovieGame() {
  const feedbackTimeoutRef = useRef<number | null>(null);
  const roundExitTimeoutRef = useRef<number | null>(null);
  const roundEnterTimeoutRef = useRef<number | null>(null);

  const [mode, setMode] = useState<GameMode>("classic");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [pair, setPair] = useState<MoviePair | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => readHighScore("classic"));
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">(
    "idle",
  );
  const [selectedChoice, setSelectedChoice] = useState<GuessChoice | null>(null);
  const [usedMovieKeys, setUsedMovieKeys] = useState<string[]>([]);
  const [roundTransition, setRoundTransition] = useState<RoundTransition>("idle");
  const [roundEndReason, setRoundEndReason] = useState<RoundEndReason>(null);

  function getPairForMode(
    gameMode: GameMode,
    moviePool: Movie[],
    currentUsedMovieKeys: string[],
  ) {
    return getRandomPair(
      moviePool,
      getModeRules(gameMode),
      new Set(currentUsedMovieKeys),
    );
  }

  useEffect(() => {
    async function initializeGame() {
      try {
        const loadedMovies = await loadMovies();

        if (loadedMovies.length < 2) {
          setError("Add more movie ratings to start playing.");
          return;
        }

        const nextPair = getPairForMode("classic", loadedMovies, []);

        if (!nextPair) {
          setError("Your CSV needs more valid rating combinations to start playing.");
          return;
        }

        setMovies(loadedMovies);
        setPair(nextPair);
        setError(null);
      } catch {
        setError("Could not load the movie data.");
      } finally {
        setLoading(false);
      }
    }

    void initializeGame();

    return () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }

      if (roundExitTimeoutRef.current !== null) {
        window.clearTimeout(roundExitTimeoutRef.current);
      }

      if (roundEnterTimeoutRef.current !== null) {
        window.clearTimeout(roundEnterTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setHighScore(readHighScore(mode));
  }, [mode]);

  function clearFeedbackTimeout() {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }

  function clearRoundTransitionTimeouts() {
    if (roundExitTimeoutRef.current !== null) {
      window.clearTimeout(roundExitTimeoutRef.current);
      roundExitTimeoutRef.current = null;
    }

    if (roundEnterTimeoutRef.current !== null) {
      window.clearTimeout(roundEnterTimeoutRef.current);
      roundEnterTimeoutRef.current = null;
    }
  }

  function resetFeedbackState() {
    clearFeedbackTimeout();
    setFeedback("idle");
    setSelectedChoice(null);
  }

  function getCurrentPairKeys(currentPair: MoviePair): string[] {
    return [
      getMovieKey(currentPair.left.name, currentPair.left.year),
      getMovieKey(currentPair.right.name, currentPair.right.year),
    ];
  }

  function applyFreshRound(gameMode: GameMode, nextScore: number) {
    const nextPair = getPairForMode(gameMode, movies, []);

    if (!nextPair) {
      setError("This mode needs more valid rating combinations from the CSV.");
      return;
    }

    setMode(gameMode);
    setScore(nextScore);
    setGameOver(false);
    setPair(nextPair);
    setUsedMovieKeys([]);
    setRoundEndReason(null);
    setRoundTransition("idle");
    resetFeedbackState();
    setError(null);
  }

  function applyNextRound(nextScore: number) {
    if (!pair) {
      return;
    }

    const nextUsedMovieKeys = [...usedMovieKeys, ...getCurrentPairKeys(pair)];
    const nextPair = getPairForMode(mode, movies, nextUsedMovieKeys);

    if (!nextPair) {
      setScore(nextScore);
      setUsedMovieKeys(nextUsedMovieKeys);
      setGameOver(true);
      setRoundEndReason("exhausted");
      resetFeedbackState();
      return;
    }

    setScore(nextScore);
    setPair(nextPair);
    setUsedMovieKeys(nextUsedMovieKeys);
    resetFeedbackState();
  }

  function startNextRound(nextScore: number) {
    if (roundTransition !== "idle") {
      return;
    }

    clearRoundTransitionTimeouts();
    setRoundTransition("exiting");

    roundExitTimeoutRef.current = window.setTimeout(() => {
      applyNextRound(nextScore);
      setRoundTransition("entering");

      roundEnterTimeoutRef.current = window.setTimeout(() => {
        setRoundTransition("idle");
        roundEnterTimeoutRef.current = null;
      }, ROUND_ENTER_DURATION_MS);

      roundExitTimeoutRef.current = null;
    }, ROUND_EXIT_DURATION_MS);
  }

  function handleGuess(guessChoice: GuessChoice) {
    if (!pair || gameOver || feedback !== "idle") {
      return;
    }

    setSelectedChoice(guessChoice);

    if (isCorrectGuess(pair, guessChoice)) {
      const nextScore = score + 1;

      if (nextScore > highScore) {
        setHighScore(nextScore);
        writeHighScore(mode, nextScore);
      }

      setScore(nextScore);
      setRoundEndReason(null);
      setRoundTransition("idle");
      setFeedback("correct");
      return;
    }

    setFeedback("wrong");
    setRoundEndReason("wrong");
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setGameOver(true);
      clearFeedbackTimeout();
    }, 1200);
  }

  function handleRestart() {
    clearRoundTransitionTimeouts();
    applyFreshRound(mode, 0);
  }

  function handleModeChange(nextMode: GameMode) {
    if (nextMode === mode) {
      return;
    }

    clearRoundTransitionTimeouts();
    applyFreshRound(nextMode, 0);
  }

  const correctChoice = pair ? getCorrectChoice(pair) : null;
  const correctMovie =
    pair && correctChoice !== "same" ? getHigherRatedMovie(pair) : null;

  function getCardVariant(
    movie: Movie,
    side: Exclude<GuessChoice, "same">,
  ): "default" | "correct" | "wrong" | "missed" {
    if (!selectedChoice || !correctChoice) {
      return "default";
    }

    if (feedback === "correct") {
      if (correctChoice === "same") {
        return "correct";
      }

      return selectedChoice === side ? "correct" : "default";
    }

    if (selectedChoice === side) {
      return "wrong";
    }

    if (correctChoice === "same") {
      return "missed";
    }

    const isCorrect = correctMovie
      ? getMovieKey(movie.name, movie.year) ===
        getMovieKey(correctMovie.name, correctMovie.year)
      : false;

    return isCorrect ? "missed" : "default";
  }

  function shouldRevealRating(): boolean {
    return feedback !== "idle";
  }

  function getFeedbackMessage() {
    if (!pair || !correctChoice) {
      return null;
    }

    if (feedback === "correct") {
      if (correctChoice === "same") {
        return `Correct. Jose gave both movies the same rating: ${formatRating(pair.left.rating)}.`;
      }

      const guessedMovie = correctChoice === "left" ? pair.left : pair.right;
      const otherMovie = correctChoice === "left" ? pair.right : pair.left;

      return `Correct. Score +1. Jose rated this matchup ${formatRating(guessedMovie.rating)} vs ${formatRating(otherMovie.rating)}.`;
    }

    if (feedback === "wrong") {
      if (correctChoice === "same") {
        return `Wrong. Jose gave both movies the same rating: ${formatRating(pair.left.rating)}.`;
      }

      return `Wrong. Jose rated ${correctMovie?.name} higher, ${formatRating(
        pair.left.rating > pair.right.rating ? pair.left.rating : pair.right.rating,
      )} vs ${formatRating(
        pair.left.rating > pair.right.rating ? pair.right.rating : pair.left.rating,
      )}.`;
    }

    return null;
  }

  const feedbackMessage = getFeedbackMessage();

  const roundTransitionClassName =
    roundTransition === "exiting"
      ? "animate-round-exit"
      : roundTransition === "entering"
        ? "animate-round-enter"
        : "";

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
        Loading your movie ratings...
      </div>
    );
  }

  if (error || !pair) {
    return (
      <div className="space-y-4 rounded-3xl border border-red-400/20 bg-red-500/10 p-8 text-center">
        <p className="text-lg font-medium text-red-100">
          {error ?? "Something went wrong."}
        </p>
        <p className="text-sm text-red-100/70">
          Check `public/data/ratings.csv` or use the included sample file.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2 rounded-[1.35rem] border border-white/10 bg-white/5 p-3 sm:rounded-2xl sm:p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">
          Mode
        </p>

        <div className="flex flex-wrap gap-2">
          {(["classic", "difficult"] as const).map((modeOption) => {
            const isActive = modeOption === mode;

            return (
              <button
                key={modeOption}
                type="button"
                onClick={() => handleModeChange(modeOption)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  isActive
                    ? "border border-amber-300/40 bg-amber-300/12 text-amber-100"
                    : "border border-white/10 bg-slate-950/30 text-slate-300 hover:border-white/20 hover:bg-white/6"
                }`}
              >
                {modeOption === "classic" ? "Classic" : "Difficult"}
              </button>
            );
          })}
        </div>

        <p className="text-sm leading-5 text-slate-300">
          {mode === "classic"
            ? "Different ratings only, with no repeated movies in a run."
            : "Movies stay within one star, same ratings can be guessed, and no movies repeat in a run."}
        </p>
      </div>

      <ScoreBoard highScore={highScore} score={score} />

      {feedback === "correct" && feedbackMessage ? (
        <div className="rounded-[1.35rem] border border-emerald-300/30 bg-emerald-400/12 px-4 py-3 text-center text-sm leading-5 text-emerald-100 animate-success-pulse sm:rounded-2xl sm:text-base">
          {feedbackMessage}
        </div>
      ) : null}

      {feedback === "wrong" && feedbackMessage ? (
        <div className="rounded-[1.35rem] border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-center text-sm leading-5 text-rose-100 animate-failure-shake sm:rounded-2xl sm:text-base">
          {feedbackMessage}
        </div>
      ) : null}

      {gameOver ? (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-center sm:rounded-3xl sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-300/80 sm:text-sm sm:tracking-[0.2em]">
            Game Over
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
            Final score: {score}
          </h2>
          <p className="mt-3 text-sm leading-5 text-slate-300 sm:text-base">
            {roundEndReason === "exhausted"
              ? "No more valid matchups are left in this run. Restart to play again."
              : "The ratings were revealed by the last pick. Run it back."}
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 sm:mt-6 sm:w-auto"
          >
            Restart Game
          </button>
        </div>
      ) : null}

      <div className="space-y-1.5 text-center sm:space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 sm:text-sm sm:tracking-[0.2em]">
          Which Movie Did Jose Rate Higher?
        </p>
        <p className="text-sm leading-5 text-slate-300 sm:text-base">
          {mode === "classic"
            ? "Choose the movie Jose rated higher on Letterboxd."
            : "Choose the higher-rated movie, or pick Same Rating if both match."}
        </p>
      </div>

      <div className={`grid gap-2.5 md:grid-cols-2 md:gap-4 ${roundTransitionClassName}`}>
        <MovieCard
          movie={pair.left}
          onSelect={() => handleGuess("left")}
          disabled={gameOver || feedback !== "idle"}
          variant={getCardVariant(pair.left, "left")}
          revealRating={shouldRevealRating()}
        />
        <MovieCard
          movie={pair.right}
          onSelect={() => handleGuess("right")}
          disabled={gameOver || feedback !== "idle"}
          variant={getCardVariant(pair.right, "right")}
          revealRating={shouldRevealRating()}
        />
      </div>

      {mode === "difficult" ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => handleGuess("same")}
            disabled={gameOver || feedback !== "idle"}
            className={`inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition sm:w-auto ${
              feedback === "correct" && correctChoice === "same"
                ? "border border-emerald-300/60 bg-emerald-400/12 text-emerald-100"
                : feedback === "wrong" && selectedChoice === "same"
                  ? "border border-rose-300/60 bg-rose-400/12 text-rose-100"
                  : "border border-white/15 bg-white/5 text-slate-100 hover:border-white/30 hover:bg-white/8"
            } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            Same Rating
          </button>
        </div>
      ) : null}

      {feedback === "correct" ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => startNextRound(score)}
            className="inline-flex w-full items-center justify-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            disabled={roundTransition !== "idle"}
          >
            Next Round
          </button>
        </div>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleRestart}
          className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/8 sm:w-auto"
        >
          Restart Round
        </button>
      </div>
    </div>
  );
}
