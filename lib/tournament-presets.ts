export type TournamentPresetEntry = {
  seed: number;
  label: string;
  year: number;
};

export type TournamentPreset = {
  id: string;
  title: string;
  description: string;
  entries: TournamentPresetEntry[];
};

export const TOURNAMENT_PRESETS: TournamentPreset[] = [
  {
    id: "disney-classics",
    title: "Disney Classics",
    description: "A seeded 16-movie bracket of Disney animated classics.",
    entries: [
      { seed: 1, label: "The Lion King", year: 1994 },
      { seed: 2, label: "Beauty and the Beast", year: 1991 },
      { seed: 3, label: "Aladdin", year: 1992 },
      { seed: 4, label: "Mulan", year: 1998 },
      { seed: 5, label: "The Little Mermaid", year: 1989 },
      { seed: 6, label: "Atlantis: The Lost Empire", year: 2001 },
      { seed: 7, label: "Cinderella", year: 1950 },
      { seed: 8, label: "Snow White and the Seven Dwarfs", year: 1937 },
      { seed: 9, label: "Tarzan", year: 1999 },
      { seed: 10, label: "Hercules", year: 1997 },
      { seed: 11, label: "The Jungle Book", year: 1967 },
      { seed: 12, label: "Peter Pan", year: 1953 },
      { seed: 13, label: "Pinocchio", year: 1940 },
      { seed: 14, label: "Treasure Planet", year: 2002 },
      { seed: 15, label: "Pocahontas", year: 1995 },
      { seed: 16, label: "The Hunchback of Notre Dame", year: 1996 },
    ],
  },
];
