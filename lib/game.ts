import { getMovieKey } from "@/lib/movie-key";
import type {
  CardSide,
  GuessChoice,
  Movie,
  MoviePair,
} from "@/lib/types";

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
  if (getMovieKey(baseMovie.name, baseMovie.year) === getMovieKey(candidate.name, candidate.year)) {
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

export function getRandomPair(movies: Movie[], rules: PairRules): MoviePair | null {
  if (movies.length < 2) {
    return null;
  }

  const left = randomItem(movies);
  const candidates = movies.filter((movie) => isValidPairCandidate(left, movie, rules));

  if (candidates.length === 0) {
    return null;
  }

  return {
    left,
    right: randomItem(candidates),
  };
}

export function getPairWithCarryOver(
  movies: Movie[],
  carryOverMovie: Movie,
  carryOverSide: CardSide,
  rules: PairRules,
): MoviePair | null {
  const candidates = movies.filter((movie) =>
    isValidPairCandidate(carryOverMovie, movie, rules),
  );

  if (candidates.length === 0) {
    return null;
  }

  const challenger = randomItem(candidates);

  return carryOverSide === "left"
    ? {
        left: carryOverMovie,
        right: challenger,
      }
    : {
        left: challenger,
        right: carryOverMovie,
      };
}

export function getHigherRatedMovie(pair: MoviePair): Movie {
  return pair.left.rating > pair.right.rating ? pair.left : pair.right;
}

export function getOtherMovie(pair: MoviePair, movie: Movie): Movie {
  const movieKey = getMovieKey(movie.name, movie.year);

  return getMovieKey(pair.left.name, pair.left.year) === movieKey
    ? pair.right
    : pair.left;
}

export function getMovieSide(pair: MoviePair, movie: Movie): CardSide {
  const movieKey = getMovieKey(movie.name, movie.year);

  return getMovieKey(pair.left.name, pair.left.year) === movieKey
    ? "left"
    : "right";
}

export function getCorrectChoice(pair: MoviePair): GuessChoice {
  if (pair.left.rating === pair.right.rating) {
    return "same";
  }

  return pair.left.rating > pair.right.rating ? "left" : "right";
}

export function getNextCarryOverMovie(
  pair: MoviePair,
  currentCarryOverMovie: Movie | null,
): Movie {
  const correctChoice = getCorrectChoice(pair);

  if (correctChoice === "same") {
    if (!currentCarryOverMovie) {
      return randomItem([pair.left, pair.right]);
    }

    return getOtherMovie(pair, currentCarryOverMovie);
  }

  const winner = correctChoice === "left" ? pair.left : pair.right;

  if (!currentCarryOverMovie) {
    return winner;
  }

  const winnerKey = getMovieKey(winner.name, winner.year);
  const carryOverKey = getMovieKey(
    currentCarryOverMovie.name,
    currentCarryOverMovie.year,
  );

  if (winnerKey === carryOverKey) {
    return getOtherMovie(pair, winner);
  }

  return winner;
}

export function isCorrectGuess(pair: MoviePair, guessChoice: GuessChoice): boolean {
  return getCorrectChoice(pair) === guessChoice;
}
