"use client";

import { useEffect, useRef, useState } from "react";

import MovieCard from "@/components/movie-card";
import ScoreBoard from "@/components/score-board";
import { loadMovies } from "@/lib/csv";
import {
  getHigherRatedMovie,
  getMovieSide,
  getNextClassicCarryOver,
  getPairWithCarryOver,
  getRandomPair,
  isCorrectGuess,
} from "@/lib/game";
import { getMovieKey } from "@/lib/movie-key";
import { formatRating } from "@/lib/ratings";
import { readHighScore, writeHighScore } from "@/lib/storage";
import type { CardSide, GameMode, Movie, MoviePair } from "@/lib/types";

export default function MovieGame() {
  const feedbackTimeoutRef = useRef<number | null>(null);
  const mode: GameMode = "classic";
  const [movies, setMovies] = useState<Movie[]>([]);
  const [pair, setPair] = useState<MoviePair | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => readHighScore());
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">(
    "idle",
  );
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [carryOverMovie, setCarryOverMovie] = useState<Movie | null>(null);
  const [pendingCarryOverMovie, setPendingCarryOverMovie] = useState<Movie | null>(null);
  const [pendingCarryOverSide, setPendingCarryOverSide] = useState<CardSide | null>(null);
  const [persistedRevealMovieKey, setPersistedRevealMovieKey] = useState<string | null>(null);

  function getClassicPair(
    nextCarryOverMovie: Movie | null,
    nextCarryOverSide: CardSide | null,
    moviePool: Movie[],
  ) {
    return nextCarryOverMovie && nextCarryOverSide
      ? getPairWithCarryOver(moviePool, nextCarryOverMovie, nextCarryOverSide)
      : getRandomPair(moviePool);
  }

  useEffect(() => {
    async function initializeGame() {
      try {
        const loadedMovies = await loadMovies();

        if (loadedMovies.length < 2) {
          setError("Add more movie ratings to start playing.");
          return;
        }

        const nextPair = getClassicPair(null, null, loadedMovies);

        if (!nextPair) {
          setError("Your CSV needs at least two movies with different ratings.");
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
    };
  }, []);

  function clearFeedbackTimeout() {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }

  function resetFeedbackState() {
    clearFeedbackTimeout();
    setFeedback("idle");
    setSelectedMovie(null);
  }

  function startNextRound(nextScore: number) {
    const nextPair = getClassicPair(
      pendingCarryOverMovie,
      pendingCarryOverSide,
      movies,
    );

    if (!nextPair) {
      setGameOver(true);
      return;
    }

    setScore(nextScore);
    setPair(nextPair);
    setCarryOverMovie(pendingCarryOverMovie);
    setPendingCarryOverMovie(null);
    setPendingCarryOverSide(null);
    resetFeedbackState();
  }

  function handlePick(selectedMovie: Movie) {
    if (!pair || gameOver || feedback !== "idle") {
      return;
    }

    setSelectedMovie(selectedMovie);

    if (isCorrectGuess(pair, selectedMovie)) {
      const nextScore = score + 1;
      const nextCarryOverMovie = getNextClassicCarryOver(pair, carryOverMovie);
      const nextCarryOverSide = getMovieSide(pair, nextCarryOverMovie);

      if (nextScore > highScore) {
        setHighScore(nextScore);
        writeHighScore(nextScore);
      }

      setScore(nextScore);
      setPendingCarryOverMovie(nextCarryOverMovie);
      setPendingCarryOverSide(nextCarryOverSide);
      setPersistedRevealMovieKey(
        getMovieKey(nextCarryOverMovie.name, nextCarryOverMovie.year),
      );
      setFeedback("correct");

      return;
    }

    setFeedback("wrong");
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setGameOver(true);
      clearFeedbackTimeout();
    }, 1200);
  }

  function handleRestart() {
    resetFeedbackState();

    const nextPair = getClassicPair(null, null, movies);

    if (!nextPair) {
      setError("Your CSV needs at least two movies with different ratings.");
      return;
    }

    setScore(0);
    setGameOver(false);
    setPair(nextPair);
    setCarryOverMovie(null);
    setPendingCarryOverMovie(null);
    setPendingCarryOverSide(null);
    setPersistedRevealMovieKey(null);
    setError(null);
  }

  const correctMovie = pair ? getHigherRatedMovie(pair) : null;
  const selectedMovieRating = selectedMovie?.rating;
  const correctMovieRating = correctMovie?.rating;

  function getCardVariant(movie: Movie): "default" | "correct" | "wrong" | "missed" {
    if (!selectedMovie || !correctMovie) {
      return "default";
    }

    const isSelected =
      movie.name === selectedMovie.name && movie.year === selectedMovie.year;
    const isCorrect =
      movie.name === correctMovie.name && movie.year === correctMovie.year;

    if (feedback === "correct" && isSelected) {
      return "correct";
    }

    if (feedback === "wrong" && isSelected) {
      return "wrong";
    }

    if (feedback === "wrong" && isCorrect) {
      return "missed";
    }

    return "default";
  }

  function shouldRevealRating(movie: Movie): boolean {
    if (feedback !== "idle") {
      return true;
    }

    return getMovieKey(movie.name, movie.year) === persistedRevealMovieKey;
  }

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
          Check `public/data/letterboxd-ratings.csv` or use the included sample file.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          Mode
        </p>
        <div className="inline-flex rounded-full border border-amber-300/40 bg-amber-300/12 px-4 py-2 text-sm font-semibold text-amber-100">
          {mode === "classic" ? "Classic" : mode}
        </div>
        <p className="text-sm text-slate-300">
          Higher-rated movies carry forward, but never for more than two rounds.
        </p>
      </div>

      <ScoreBoard highScore={highScore} score={score} />

      {feedback === "correct" ? (
        <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/12 px-4 py-3 text-center text-emerald-100 animate-success-pulse">
          Correct. Score +1. Jose rated this matchup {formatRating(selectedMovieRating ?? 0)} vs{" "}
          {formatRating(
            pair.left.name === selectedMovie?.name &&
              pair.left.year === selectedMovie?.year
              ? pair.right.rating
              : pair.left.rating,
          )}
          .
        </div>
      ) : null}

      {feedback === "wrong" && correctMovie ? (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-center text-rose-100 animate-failure-shake">
          Wrong. Jose rated <span className="font-semibold">{correctMovie.name}</span>{" "}
          higher, {formatRating(correctMovieRating ?? 0)} vs {formatRating(selectedMovieRating ?? 0)}.
        </div>
      ) : null}

      {gameOver ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300/80">
            Game Over
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Final score: {score}
          </h2>
          <p className="mt-3 text-slate-300">
            The higher-rated movie was revealed by your last pick. Run it back.
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Restart Game
          </button>
        </div>
      ) : null}

      <div className="space-y-2 text-center sm:space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
          Which Movie Did Jose Rate Higher?
        </p>
        <p className="text-slate-300">
          Choose the movie Jose rated higher on Letterboxd.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <MovieCard
          movie={pair.left}
          onSelect={handlePick}
          disabled={gameOver || feedback !== "idle"}
          variant={getCardVariant(pair.left)}
          revealRating={shouldRevealRating(pair.left)}
        />
        <MovieCard
          movie={pair.right}
          onSelect={handlePick}
          disabled={gameOver || feedback !== "idle"}
          variant={getCardVariant(pair.right)}
          revealRating={shouldRevealRating(pair.right)}
        />
      </div>

      {feedback === "correct" ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => startNextRound(score)}
            className="inline-flex w-full items-center justify-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 sm:w-auto"
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
