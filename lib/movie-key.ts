export function getMovieKey(name: string, year: number | null): string {
  return `${name}|${year ?? ""}`;
}
