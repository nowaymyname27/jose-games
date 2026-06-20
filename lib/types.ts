export type Movie = {
  name: string;
  year: number | null;
  rating: number;
};

export type MoviePair = {
  left: Movie;
  right: Movie;
};
