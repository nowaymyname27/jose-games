import type { Movie, MoviePair } from "@/lib/types";

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

export function isCorrectGuess(pair: MoviePair, selectedMovie: Movie): boolean {
  const higherRatedMovie =
    pair.left.rating > pair.right.rating ? pair.left : pair.right;

  return (
    selectedMovie.name === higherRatedMovie.name &&
    selectedMovie.year === higherRatedMovie.year
  );
}
