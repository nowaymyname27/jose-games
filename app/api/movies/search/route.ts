import { NextResponse } from "next/server";

type TmdbMovieResult = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
};

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is missing. Add it to .env.local." },
      { status: 500 },
    );
  }

  if (query.length < 2) {
    return NextResponse.json({ movies: [] });
  }

  const tmdbSearchParams = new URLSearchParams({
    api_key: apiKey,
    query,
    include_adult: "false",
  });

  const response = await fetch(
    `https://api.themoviedb.org/3/search/movie?${tmdbSearchParams.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: `TMDb search failed with status ${response.status}.` },
      { status: 502 },
    );
  }

  const data = (await response.json()) as { results?: TmdbMovieResult[] };
  const movies = (data.results ?? []).slice(0, 12).map((movie) => ({
    tmdbId: movie.id,
    label: movie.title,
    year: parseReleaseYear(movie.release_date),
    posterUrl: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : undefined,
  }));

  return NextResponse.json({ movies });
}

function parseReleaseYear(releaseDate?: string) {
  if (!releaseDate) {
    return null;
  }

  const parsedYear = Number(releaseDate.slice(0, 4));
  return Number.isNaN(parsedYear) ? null : parsedYear;
}
