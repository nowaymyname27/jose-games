# Jose Games

## Project Purpose

Jose Games is a personal mini-game collection built with Next.js. The first game is `Which Movie Did Jose Rate Higher?`, where the player picks which of two movies Jose rated higher on Letterboxd.

The app also includes:

- `Guess Who?` with shared board seeds
- `Tournament Lobby` for shared 4, 8, or 16-entry brackets with room codes and live vote syncing

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

Place your Letterboxd ratings export at either of these paths:

```text
public/data/ratings.csv
```

or

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

## Poster Covers

Poster covers are cached locally in:

```text
public/data/movie-posters.json
```

To refresh the poster cache:

1. Add a TMDb API key to `.env.local`:

```bash
TMDB_API_KEY=your_key_here
```

2. Run:

```bash
npm run fetch-posters
```

The app uses the cached poster URLs at runtime, so gameplay does not depend on live TMDb API calls.

## Notes

- `Classic` mode only generates matchups between movies with different ratings.
- `Difficult` mode allows same-rating matchups, adds a `Same Rating` answer button, and keeps all matchups within a 1-star difference.
- In both modes, each round is a fresh random matchup and movies do not repeat within a run.
- A run ends once there are no more valid unused matchups left for the current mode.
- High score is stored in `localStorage` in the browser.
- Poster images are fetched from TMDb once and then stored in the local cache file.
- No authentication, backend API, or database is included yet.

## Tournament Lobby Setup

The tournament lobby uses Supabase as its shared backend.

1. Create a Supabase project.
2. Add these variables to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. Run the SQL in:

```text
supabase/tournament-schema.sql
```

4. Restart the dev server.

Notes:

- The first version stores each room as a JSON document in one `tournament_rooms` table.
- Room creators become the host.
- Players join with a browser session id and display name.
- Matchups use majority vote, and tied rounds require a host tiebreak.

## Future Features

- More Jose Games mini-games using the same movie dataset
- Filters by decade, genre, or rating band
- Streak tracking and summary stats
- Reveal screens with exact ratings after each wrong guess
- Better CSV validation and import feedback
