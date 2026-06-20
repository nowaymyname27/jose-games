import { getMovieKey } from "@/lib/movie-key";
import type { GuessChoice, Movie, MoviePair } from "@/lib/types";

type PairRules = {
  allowEqualRatings: boolean;
  maxRatingDifference: number | null;
};

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function isWithinAllowedRange(
  leftRating: number,
  rightRating: number,
  maxRatingDifference: number | null,
): boolean {
  if (maxRatingDifference === null) {
    return true;
  }

  return Math.abs(leftRating - rightRating) <= maxRatingDifference;
}

function isValidPairCandidate(
  baseMovie: Movie,
  candidate: Movie,
  rules: PairRules,
): boolean {
  if (
    getMovieKey(baseMovie.name, baseMovie.year) ===
    getMovieKey(candidate.name, candidate.year)
  ) {
    return false;
  }

  if (!rules.allowEqualRatings && baseMovie.rating === candidate.rating) {
    return false;
  }

  return isWithinAllowedRange(
    baseMovie.rating,
    candidate.rating,
    rules.maxRatingDifference,
  );
}

export function getRandomPair(
  movies: Movie[],
  rules: PairRules,
  usedMovieKeys: Set<string>,
): MoviePair | null {
  const availableMovies = movies.filter(
    (movie) => !usedMovieKeys.has(getMovieKey(movie.name, movie.year)),
  );

  if (availableMovies.length < 2) {
    return null;
  }

  const shuffledBases = [...availableMovies].sort(() => Math.random() - 0.5);

  for (const left of shuffledBases) {
    const candidates = availableMovies.filter((movie) =>
      isValidPairCandidate(left, movie, rules),
    );

    if (candidates.length === 0) {
      continue;
    }

    return {
      left,
      right: randomItem(candidates),
    };
  }

  return null;
}

export function getHigherRatedMovie(pair: MoviePair): Movie {
  return pair.left.rating > pair.right.rating ? pair.left : pair.right;
}

export function getCorrectChoice(pair: MoviePair): GuessChoice {
  if (pair.left.rating === pair.right.rating) {
    return "same";
  }

  return pair.left.rating > pair.right.rating ? "left" : "right";
}

export function isCorrectGuess(pair: MoviePair, guessChoice: GuessChoice): boolean {
  return getCorrectChoice(pair) === guessChoice;
}
