import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import Papa from "papaparse";

import { getMovieKey } from "../lib/movie-key";
import type { PosterMap } from "../lib/types";

type CsvRow = {
  Name?: string;
  Year?: string;
  Rating?: string;
};

type MovieLookup = {
  name: string;
  year: number | null;
};

type TmdbResult = {
  title: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  popularity?: number;
};

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data");
const CSV_FILES = [
  path.join(DATA_DIR, "ratings.csv"),
  path.join(DATA_DIR, "letterboxd-ratings.csv"),
  path.join(DATA_DIR, "sample-letterboxd-ratings.csv"),
];
const POSTER_FILE = path.join(DATA_DIR, "movie-posters.json");
const ENV_FILE = path.join(ROOT, ".env.local");
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const CONCURRENCY = 6;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseYear(value?: string): number | null {
  const parsed = Number(value?.trim());
  return Number.isNaN(parsed) ? null : parsed;
}

function parseMovies(csvText: string): MovieLookup[] {
  const result = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const seen = new Set<string>();
  const movies: MovieLookup[] = [];

  for (const row of result.data) {
    const name = row.Name?.trim();
    const rating = Number(row.Rating?.trim());

    if (!name || Number.isNaN(rating)) {
      continue;
    }

    const year = parseYear(row.Year);
    const key = getMovieKey(name, year);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    movies.push({ name, year });
  }

  return movies;
}

async function readFirstExistingCsv(): Promise<string> {
  for (const filePath of CSV_FILES) {
    try {
      await access(filePath);
      return await readFile(filePath, "utf8");
    } catch {
      continue;
    }
  }

  throw new Error("No ratings CSV found in public/data.");
}

async function readPosterMap(): Promise<PosterMap> {
  try {
    const content = await readFile(POSTER_FILE, "utf8");
    return JSON.parse(content) as PosterMap;
  } catch {
    return {};
  }
}

async function readLocalEnv(): Promise<Record<string, string>> {
  try {
    const content = await readFile(ENV_FILE, "utf8");

    return content.split(/\r?\n/).reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return env;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        return env;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      env[key] = value;
      return env;
    }, {});
  } catch {
    return {};
  }
}

function getReleaseYear(releaseDate?: string): number | null {
  if (!releaseDate) {
    return null;
  }

  const parsed = Number(releaseDate.slice(0, 4));
  return Number.isNaN(parsed) ? null : parsed;
}

function getResultTitle(result: TmdbResult): string {
  return result.title || result.name || "";
}

function scoreResult(movie: MovieLookup, result: TmdbResult): number {
  let score = 0;
  const normalizedMovieTitle = normalizeTitle(movie.name);
  const normalizedResultTitle = normalizeTitle(getResultTitle(result));
  const releaseYear = getReleaseYear(result.release_date ?? result.first_air_date);

  if (normalizedMovieTitle === normalizedResultTitle) {
    score += 100;
  }

  if (movie.year !== null && releaseYear === movie.year) {
    score += 50;
  }

  if (normalizedResultTitle.includes(normalizedMovieTitle)) {
    score += 10;
  }

  score += Math.min(result.popularity ?? 0, 25);

  return score;
}

async function fetchPoster(movie: MovieLookup, apiKey: string): Promise<string | null> {
  async function search(endpoint: "movie" | "tv"): Promise<string | null> {
    const searchParams = new URLSearchParams({
      api_key: apiKey,
      query: movie.name,
    });

    if (movie.year !== null) {
      searchParams.set(endpoint === "movie" ? "year" : "first_air_date_year", String(movie.year));
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/search/${endpoint}?${searchParams.toString()}`,
    );

    if (!response.ok) {
      throw new Error(`TMDb request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as { results?: TmdbResult[] };
    const bestMatch = (data.results ?? [])
      .filter((result) => Boolean(result.poster_path))
      .sort((left, right) => scoreResult(movie, right) - scoreResult(movie, left))[0];

    if (!bestMatch?.poster_path) {
      return null;
    }

    return `${TMDB_IMAGE_BASE}${bestMatch.poster_path}`;
  }

  const moviePoster = await search("movie");

  if (moviePoster) {
    return moviePoster;
  }

  return search("tv");
}

async function main() {
  const localEnv = await readLocalEnv();
  const apiKey = process.env.TMDB_API_KEY ?? localEnv.TMDB_API_KEY;

  if (!apiKey) {
    throw new Error("TMDB_API_KEY is missing. Add it to .env.local.");
  }

  const csvText = await readFirstExistingCsv();
  const movies = parseMovies(csvText);
  const existingPosters = await readPosterMap();
  const pendingMovies = movies.filter(
    (movie) => !existingPosters[getMovieKey(movie.name, movie.year)],
  );

  console.log(`Found ${movies.length} unique movies.`);
  console.log(`Need posters for ${pendingMovies.length} movies.`);

  if (pendingMovies.length === 0) {
    console.log("Poster cache is already up to date.");
    return;
  }

  let cursor = 0;
  let matched = 0;
  let unmatched = 0;
  const unmatchedTitles: string[] = [];

  async function worker() {
    while (cursor < pendingMovies.length) {
      const currentIndex = cursor;
      cursor += 1;

      const movie = pendingMovies[currentIndex];
      const key = getMovieKey(movie.name, movie.year);

      try {
        const posterUrl = await fetchPoster(movie, apiKey);

        if (posterUrl) {
          existingPosters[key] = { posterUrl };
          matched += 1;
        } else {
          unmatched += 1;
          unmatchedTitles.push(key);
        }
      } catch (error) {
        unmatched += 1;
        unmatchedTitles.push(key);
        console.error(`Failed to fetch poster for ${key}:`, error);
      }

      if ((currentIndex + 1) % 25 === 0 || currentIndex + 1 === pendingMovies.length) {
        console.log(`Processed ${currentIndex + 1}/${pendingMovies.length} movies.`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  await writeFile(POSTER_FILE, `${JSON.stringify(existingPosters, null, 2)}\n`, "utf8");

  console.log(`Matched posters: ${matched}`);
  console.log(`Unmatched posters: ${unmatched}`);

  if (unmatchedTitles.length > 0) {
    console.log("Unmatched titles:");
    for (const title of unmatchedTitles) {
      console.log(`- ${title}`);
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
