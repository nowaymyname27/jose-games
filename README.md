# Jose Games

## Project Purpose

Jose Games is a personal mini-game collection built with Next.js. The first game is `Which Movie Did I Rate Higher?`, where the player picks which of two movies Jose rated higher on Letterboxd.

The app currently uses a local CSV file as its data source so it stays simple and easy to extend.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open `http://localhost:3000` in your browser.

## Letterboxd CSV Location

Place your Letterboxd ratings export at:

```text
public/data/letterboxd-ratings.csv
```

If that file is missing, the app falls back to the included sample file:

```text
public/data/sample-letterboxd-ratings.csv
```

## Expected CSV Fields

The CSV should include these columns:

- `Name`
- `Year`
- `Rating`

Rows with missing movie names or invalid ratings are ignored.

## Notes

- The game only generates matchups between movies with different ratings.
- High score is stored in `localStorage` in the browser.
- No authentication, backend API, or database is included yet.

## Future Features

- More Jose Games mini-games using the same movie dataset
- Filters by decade, genre, or rating band
- Streak tracking and summary stats
- Reveal screens with exact ratings after each wrong guess
- Better CSV validation and import feedback
