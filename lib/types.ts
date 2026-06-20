export type Movie = {
  name: string;
  year: number | null;
  rating: number;
  posterUrl?: string;
};

export type GameMode = "classic";

export type CardSide = "left" | "right";

export type MoviePair = {
  left: Movie;
  right: Movie;
};

export type PosterEntry = {
  posterUrl: string;
};

export type PosterMap = Record<string, PosterEntry>;
