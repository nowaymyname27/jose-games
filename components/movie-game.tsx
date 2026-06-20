"use client";

import { useEffect, useRef, useState } from "react";

import MovieCard from "@/components/movie-card";
import ScoreBoard from "@/components/score-board";
import { loadMovies } from "@/lib/csv";
import { getRandomPair, isCorrectGuess } from "@/lib/game";
import { formatRating } from "@/lib/ratings";
import { readHighScore, writeHighScore } from "@/lib/storage";
import type { Movie, MoviePair } from "@/lib/types";

export default function MovieGame() {
  const feedbackTimeoutRef = useRef<number | null>(null);
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

  useEffect(() => {
    async function initializeGame() {
      try {
        const loadedMovies = await loadMovies();

        if (loadedMovies.length < 2) {
          setError("Add more movie ratings to start playing.");
          return;
        }

        const nextPair = getRandomPair(loadedMovies);

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

  function getCorrectMovie(currentPair: MoviePair): Movie {
    return currentPair.left.rating > currentPair.right.rating
      ? currentPair.left
      : currentPair.right;
  }

  function startNextRound(nextScore: number) {
    const nextPair = getRandomPair(movies);

    if (!nextPair) {
      setGameOver(true);
      return;
    }

    setScore(nextScore);
    setPair(nextPair);
    resetFeedbackState();
  }

  function handlePick(selectedMovie: Movie) {
    if (!pair || gameOver || feedback !== "idle") {
      return;
    }

    setSelectedMovie(selectedMovie);

    if (isCorrectGuess(pair, selectedMovie)) {
      const nextScore = score + 1;

      if (nextScore > highScore) {
        setHighScore(nextScore);
        writeHighScore(nextScore);
      }

      setScore(nextScore);
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

    const nextPair = getRandomPair(movies);

    if (!nextPair) {
      setError("Your CSV needs at least two movies with different ratings.");
      return;
    }

    setScore(0);
    setGameOver(false);
    setPair(nextPair);
    setError(null);
  }

  const correctMovie = pair ? getCorrectMovie(pair) : null;
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
    <div className="space-y-6">
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
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
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

      <div className="space-y-3 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
          Which Movie Did I Rate Higher?
        </p>
        <p className="text-slate-300">
          Tap the movie you think Jose rated higher on Letterboxd.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MovieCard
          movie={pair.left}
          onSelect={handlePick}
          disabled={gameOver || feedback !== "idle"}
          variant={getCardVariant(pair.left)}
          revealRating={feedback !== "idle"}
        />
        <MovieCard
          movie={pair.right}
          onSelect={handlePick}
          disabled={gameOver || feedback !== "idle"}
          variant={getCardVariant(pair.right)}
          revealRating={feedback !== "idle"}
        />
      </div>

      {feedback === "correct" ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => startNextRound(score)}
            className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            Next Matchup
          </button>
        </div>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleRestart}
          className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/8"
        >
          Restart Round
        </button>
      </div>
    </div>
  );
}
