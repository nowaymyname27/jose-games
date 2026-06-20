import { getMovieKey } from "@/lib/movie-key";
import type { CardSide, Movie, MoviePair } from "@/lib/types";

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function getRandomPair(movies: Movie[]): MoviePair | null {
  if (movies.length < 2) {
    return null;
  }

  const left = randomItem(movies);
  const candidates = movies.filter(
    (movie) =>
      movie.name !== left.name &&
      movie.rating !== left.rating,
  );

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
): MoviePair | null {
  const carryOverKey = getMovieKey(carryOverMovie.name, carryOverMovie.year);
  const candidates = movies.filter(
    (movie) =>
      getMovieKey(movie.name, movie.year) !== carryOverKey &&
      movie.rating !== carryOverMovie.rating,
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

export function getNextClassicCarryOver(
  pair: MoviePair,
  currentCarryOverMovie: Movie | null,
): Movie {
  const winner = getHigherRatedMovie(pair);

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

export function isCorrectGuess(pair: MoviePair, selectedMovie: Movie): boolean {
  const higherRatedMovie = getHigherRatedMovie(pair);

  return (
    selectedMovie.name === higherRatedMovie.name &&
    selectedMovie.year === higherRatedMovie.year
  );
}
