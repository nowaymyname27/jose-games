import { GUESS_WHO_BOARD_SIZES, type GuessWhoCategory, type GuessWhoCategoryId, type GuessWhoEntry } from "@/lib/guess-who-types";
import { normalizeSeed, shuffleWithSeed } from "@/lib/seeded-random";

export function getBoardSizeOptions(entryCount: number): number[] {
  const presetSizes = GUESS_WHO_BOARD_SIZES.filter((size) => size <= entryCount);

  if (presetSizes.length > 0) {
    return [...presetSizes];
  }

  return entryCount > 1 ? [entryCount] : [];
}

export function getDefaultBoardSize(entryCount: number): number {
  const options = getBoardSizeOptions(entryCount);

  if (options.includes(24)) {
    return 24;
  }

  return options[options.length - 1] ?? 0;
}

export function parseBoardSize(value: string | null, entryCount: number): number {
  const requestedSize = Number(value);
  const options = getBoardSizeOptions(entryCount);

  if (options.includes(requestedSize)) {
    return requestedSize;
  }

  return getDefaultBoardSize(entryCount);
}

export function buildGuessWhoBoard(
  categoryId: GuessWhoCategoryId,
  entries: GuessWhoEntry[],
  rawSeed: string,
  size: number,
): { entries: GuessWhoEntry[]; seed: string; size: number } {
  const normalizedSeed = normalizeSeed(rawSeed);
  const nextSize = parseBoardSize(String(size), entries.length);
  const seededKey = `${categoryId}:${nextSize}:${normalizedSeed}`;

  return {
    entries: shuffleWithSeed(entries, seededKey).slice(0, nextSize),
    seed: normalizedSeed,
    size: nextSize,
  };
}

export function createRandomSeed(): string {
  const adjectives = ["turbo", "checkered", "apex", "grid", "pit", "slick"];
  const nouns = ["start", "storm", "rocket", "signal", "corner", "sprint"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 900 + 100);

  return `${adjective}-${noun}-${number}`;
}

export function isGuessWhoCategory(
  value: string | null,
  categories: GuessWhoCategory[],
): value is GuessWhoCategoryId {
  return value !== null && categories.some((category) => category.id === value);
}
