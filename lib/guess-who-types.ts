export const GUESS_WHO_BOARD_SIZES = [16, 24] as const;

export type GuessWhoBoardSize = (typeof GUESS_WHO_BOARD_SIZES)[number];
export type GuessWhoCategoryId = string;

export type GuessWhoEntry = {
  id: string;
  name: string;
  imageUrl?: string;
  traits?: Record<string, boolean | number | string>;
};

export type GuessWhoCategory = {
  id: GuessWhoCategoryId;
  label: string;
};

export type GuessWhoCardState = "active" | "eliminated";

export type GuessWhoCatalog = {
  categories: GuessWhoCategory[];
  defaultCategoryId: GuessWhoCategoryId;
  entriesByCategory: Record<GuessWhoCategoryId, GuessWhoEntry[]>;
};
