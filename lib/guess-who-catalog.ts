import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { GuessWhoCatalog, GuessWhoCategory, GuessWhoCategoryId, GuessWhoEntry } from "@/lib/guess-who-types";

const GUESS_WHO_DATA_ROOT = path.join(process.cwd(), "public/data/guess-who");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  f1: "Formula 1 Drivers",
};
const CATEGORY_ORDER = ["famous-people", "f1", "videogame-characters"];

function toTitleCase(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getCategoryLabel(categoryId: string): string {
  return CATEGORY_LABEL_OVERRIDES[categoryId] ?? toTitleCase(categoryId);
}

function getCategoryOrder(categoryId: string): number {
  const knownIndex = CATEGORY_ORDER.indexOf(categoryId);

  return knownIndex === -1 ? CATEGORY_ORDER.length : knownIndex;
}

function getEntryName(fileName: string): string {
  const baseName = fileName.replace(path.extname(fileName), "");

  return toTitleCase(baseName);
}

function getEntryId(fileName: string): string {
  return fileName.replace(path.extname(fileName), "");
}

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function getGuessWhoCatalog(): GuessWhoCatalog {
  const categoryDirectories = readdirSync(GUESS_WHO_DATA_ROOT).filter((entry) => {
    if (entry.startsWith(".")) {
      return false;
    }

    return statSync(path.join(GUESS_WHO_DATA_ROOT, entry)).isDirectory();
  });

  const categories = categoryDirectories
    .map<GuessWhoCategory>((categoryId) => ({
      id: categoryId,
      label: getCategoryLabel(categoryId),
    }))
    .sort((left, right) => {
      const orderDifference = getCategoryOrder(left.id) - getCategoryOrder(right.id);

      return orderDifference !== 0 ? orderDifference : left.label.localeCompare(right.label);
    });

  const entriesByCategory = Object.fromEntries(
    categories.map((category) => {
      const categoryDirectory = path.join(GUESS_WHO_DATA_ROOT, category.id);
      const entries = readdirSync(categoryDirectory)
        .filter((fileName) => !fileName.startsWith(".") && isImageFile(fileName))
        .sort((left, right) => left.localeCompare(right))
        .map<GuessWhoEntry>((fileName) => ({
          id: getEntryId(fileName),
          name: getEntryName(fileName),
          imageUrl: `/data/guess-who/${category.id}/${fileName}`,
        }));

      return [category.id, entries];
    }),
  ) as Record<GuessWhoCategoryId, GuessWhoEntry[]>;

  const defaultCategoryId = categories.find((category) => category.id === "famous-people")?.id
    ?? categories[0]?.id
    ?? "";

  return {
    categories,
    defaultCategoryId,
    entriesByCategory,
  };
}
