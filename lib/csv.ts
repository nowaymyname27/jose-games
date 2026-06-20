import Papa from "papaparse";

import type { Movie } from "@/lib/types";

const CSV_SOURCES = [
  "/data/ratings.csv",
  "/data/letterboxd-ratings.csv",
  "/data/sample-letterboxd-ratings.csv",
];

type CsvRow = {
  Name?: string;
  Year?: string;
  Rating?: string;
};

function normalizeMovie(row: CsvRow): Movie | null {
  const name = row.Name?.trim();
  const rating = Number(row.Rating?.trim());
  const parsedYear = Number(row.Year?.trim());

  if (!name || Number.isNaN(rating)) {
    return null;
  }

  return {
    name,
    year: Number.isNaN(parsedYear) ? null : parsedYear,
    rating,
  };
}

function parseMovies(csvText: string): Movie[] {
  const result = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  return result.data
    .map(normalizeMovie)
    .filter((movie): movie is Movie => movie !== null);
}

export async function loadMovies(): Promise<Movie[]> {
  for (const source of CSV_SOURCES) {
    const response = await fetch(source, { cache: "no-store" });

    if (!response.ok) {
      continue;
    }

    const csvText = await response.text();
    const movies = parseMovies(csvText);

    if (movies.length > 0) {
      return movies;
    }
  }

  return [];
}
