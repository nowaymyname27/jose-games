import type { GameMode } from "@/lib/types";

function getHighScoreKey(mode: GameMode) {
  return `jose-games-high-score-${mode}`;
}

export function readHighScore(mode: GameMode): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = window.localStorage.getItem(getHighScoreKey(mode));
  const parsed = Number(value);

  return Number.isNaN(parsed) ? 0 : parsed;
}

export function writeHighScore(mode: GameMode, score: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getHighScoreKey(mode), String(score));
}
