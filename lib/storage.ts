const HIGH_SCORE_KEY = "jose-games-high-score";

export function readHighScore(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = window.localStorage.getItem(HIGH_SCORE_KEY);
  const parsed = Number(value);

  return Number.isNaN(parsed) ? 0 : parsed;
}

export function writeHighScore(score: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HIGH_SCORE_KEY, String(score));
}
