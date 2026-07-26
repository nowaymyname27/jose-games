"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import TournamentBracket from "@/components/tournament-bracket";
import { loadMovies } from "@/lib/csv";
import { getMovieKey } from "@/lib/movie-key";
import { getCurrentMatch, getEntryById, getMatchVoteSummary, normalizeRoomCode } from "@/lib/tournament";
import type { Movie } from "@/lib/types";
import type { TournamentRoom } from "@/lib/tournament-types";

const PLAYER_NAME_STORAGE_KEY = "jose-games-tournament-name";
const PLAYER_SESSION_STORAGE_KEY = "jose-games-tournament-session";
const ROOM_POLL_INTERVAL_MS = 2000;

type TournamentGameProps = {
  backendConfigured: boolean;
};

type ApiRoomResponse = {
  room?: TournamentRoom;
  error?: string;
};

type TournamentMovieSelection = {
  label: string;
  year: number | null;
  posterUrl?: string;
  tmdbId?: number;
};

type RemoteMovieResult = TournamentMovieSelection;

type MovieSearchTab = "rated" | "all";

type MovieSearchResponse = {
  movies?: RemoteMovieResult[];
  error?: string;
};

export default function TournamentGame({ backendConfigured }: TournamentGameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roomCode = normalizeRoomCode(searchParams.get("room"));
  const joinAttemptedRoomCodeRef = useRef<string | null>(null);

  const [sessionId] = useState(() => getOrCreateTournamentSessionId());
  const [displayName, setDisplayName] = useState(() => getStoredTournamentName());
  const [room, setRoom] = useState<TournamentRoom | null>(null);
  const [createTitle, setCreateTitle] = useState("Family Movie Bracket");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [movieSearchTab, setMovieSearchTab] = useState<MovieSearchTab>("rated");
  const [movieSearch, setMovieSearch] = useState("");
  const [remoteMovies, setRemoteMovies] = useState<RemoteMovieResult[]>([]);
  const [remoteMoviesQuery, setRemoteMoviesQuery] = useState("");
  const [selectedMovies, setSelectedMovies] = useState<TournamentMovieSelection[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(() => getStoredTournamentName());
  const [submitting, setSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const movieSearchValue = movieSearch.trim().toLowerCase();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!displayName) {
      window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, displayName);
  }, [displayName]);

  useEffect(() => {
    let cancelled = false;

    async function initializeMovies() {
      try {
        const loadedMovies = await loadMovies();

        if (!cancelled) {
          setMovies(loadedMovies);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load the movie list for tournament setup.");
        }
      } finally {
        if (!cancelled) {
          setLoadingMovies(false);
        }
      }
    }

    void initializeMovies();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (movieSearchTab !== "all" || movieSearchValue.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      void fetch(`/api/movies/search?q=${encodeURIComponent(movieSearchValue)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const payload = (await response.json()) as MovieSearchResponse;

          if (!response.ok) {
            throw new Error(payload.error ?? "Could not search all movies.");
          }

          setRemoteMovies(payload.movies ?? []);
          setRemoteMoviesQuery(movieSearchValue);
        })
        .catch((searchError) => {
          if (controller.signal.aborted) {
            return;
          }

          setRemoteMovies([]);
          setRemoteMoviesQuery(movieSearchValue);
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Could not search all movies.",
          );
        });
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [movieSearchTab, movieSearchValue]);

  useEffect(() => {
    if (!backendConfigured || !roomCode || !sessionId || !displayName.trim()) {
      return;
    }

    if (joinAttemptedRoomCodeRef.current === roomCode) {
      return;
    }

    joinAttemptedRoomCodeRef.current = roomCode;

    void postRoomAction("/api/tournament/join", {
      code: roomCode,
      displayName,
      sessionId,
    })
      .then((nextRoom) => {
        setRoom(nextRoom);
        setError(null);
      })
      .catch((joinError) => {
        setError(joinError instanceof Error ? joinError.message : "Could not join room.");
        joinAttemptedRoomCodeRef.current = null;
      });
  }, [backendConfigured, displayName, roomCode, sessionId]);

  useEffect(() => {
    if (!backendConfigured || !roomCode || !joinAttemptedRoomCodeRef.current) {
      return;
    }

    let cancelled = false;

    async function refreshRoom() {
      try {
        const response = await fetch(`/api/tournament/${roomCode}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as ApiRoomResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load room.");
        }

        if (!cancelled && payload.room) {
          setRoom(payload.room);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error ? fetchError.message : "Could not refresh room.",
          );
        }
      }
    }

    void refreshRoom();
    const intervalId = window.setInterval(() => {
      void refreshRoom();
    }, ROOM_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [backendConfigured, roomCode]);

  const activeRoom = room?.code === roomCode ? room : null;
  const roomState = activeRoom?.state ?? null;
  const currentMatch = roomState ? getCurrentMatch(roomState) : null;
  const currentVoteSummary = currentMatch ? getMatchVoteSummary(currentMatch) : null;
  const currentUser = roomState?.players.find((player) => player.sessionId === sessionId) ?? null;
  const currentUserVote = currentMatch?.votes.find((vote) => vote.sessionId === sessionId) ?? null;
  const isHost = currentUser?.isHost ?? false;
  const leftEntry = roomState && currentMatch ? getEntryById(roomState, currentMatch.leftEntryId) : null;
  const rightEntry = roomState && currentMatch ? getEntryById(roomState, currentMatch.rightEntryId) : null;
  const champion = roomState ? getEntryById(roomState, roomState.winnerEntryId) : null;
  const selectedMovieKeys = new Set(
    selectedMovies.map((movie) => getMovieSelectionKey(movie)),
  );
  const searchingRemoteMovies =
    movieSearchTab === "all" &&
    movieSearchValue.length >= 2 &&
    remoteMoviesQuery !== movieSearchValue;
  const filteredMovies = movies
    .filter((movie) => !selectedMovieKeys.has(getMovieKey(movie.name, movie.year)))
    .filter((movie) => {
      if (!movieSearchValue) {
        return true;
      }

      return `${movie.name} ${movie.year ?? ""}`.toLowerCase().includes(movieSearchValue);
    })
    .slice(0, 10);
  const filteredRemoteMovies = remoteMovies.filter(
    (movie) => !selectedMovieKeys.has(getMovieSelectionKey(movie)),
  );

  let statusMessage = "Create a room or join one with a code.";

  if (roomState?.status === "setup") {
    statusMessage = isHost
      ? "Everyone can join now. Start the bracket when your group is ready."
      : "Waiting for the host to start the bracket.";
  } else if (roomState?.status === "finished") {
    statusMessage = champion
      ? `${champion.label} won the bracket.`
      : "The tournament is finished.";
  } else if (currentMatch?.status === "tie") {
    statusMessage = isHost
      ? "The matchup is tied. Pick the tiebreak winner to keep the bracket moving."
      : "The matchup is tied. Waiting for the host to break it.";
  } else if (currentMatch?.status === "voting") {
    statusMessage = currentUserVote
      ? "Your vote is in. It will keep syncing until the matchup closes."
      : "Vote on this matchup to decide who advances.";
  } else if (roomState) {
    statusMessage = "The next matchup will appear automatically.";
  }

  async function handleCreateRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sessionId) {
      setError("Still preparing this browser session. Try again in a second.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const nextRoom = await postRoomAction("/api/tournament/create", {
        title: createTitle,
        entries: selectedMovies.map((movie) => ({
          label: movie.label,
          year: movie.year,
          posterUrl: movie.posterUrl,
          tmdbId: movie.tmdbId,
        })),
        displayName,
        sessionId,
      });

      navigateToRoom(nextRoom.code);
      joinAttemptedRoomCodeRef.current = nextRoom.code;
      setRoom(nextRoom);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create room.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sessionId) {
      setError("Still preparing this browser session. Try again in a second.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const nextRoom = await postRoomAction("/api/tournament/join", {
        code: joinCodeInput,
        displayName,
        sessionId,
      });

      navigateToRoom(nextRoom.code);
      joinAttemptedRoomCodeRef.current = nextRoom.code;
      setRoom(nextRoom);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join room.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddMovie(movie: Movie) {
    if (selectedMovies.length >= 16) {
      return;
    }

    setSelectedMovies((currentMovies) => [
      ...currentMovies,
      {
        label: movie.name,
        year: movie.year,
        posterUrl: movie.posterUrl,
      },
    ]);
    setMovieSearch("");
    setRemoteMoviesQuery("");
  }

  function handleAddRemoteMovie(movie: RemoteMovieResult) {
    if (selectedMovies.length >= 16) {
      return;
    }

    setSelectedMovies((currentMovies) => [...currentMovies, movie]);
    setMovieSearch("");
    setRemoteMovies([]);
    setRemoteMoviesQuery("");
  }

  function handleRemoveMovie(movieToRemove: TournamentMovieSelection) {
    const movieKey = getMovieSelectionKey(movieToRemove);

    setSelectedMovies((currentMovies) =>
      currentMovies.filter((movie) => getMovieSelectionKey(movie) !== movieKey),
    );
  }

  async function handleStartTournament() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/tournament/${roomCode}/start`, {
      sessionId,
    });
  }

  async function handleVote(entryId: string) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/tournament/${roomCode}/vote`, {
      sessionId,
      entryId,
    });
  }

  async function handleCloseVoting() {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/tournament/${roomCode}/close`, {
      sessionId,
    });
  }

  async function handleTieBreak(winnerEntryId: string) {
    if (!roomCode) {
      return;
    }

    await runRoomMutation(`/api/tournament/${roomCode}/tiebreak`, {
      sessionId,
      winnerEntryId,
    });
  }

  async function handleRenamePlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!roomCode) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const nextRoom = await postRoomAction("/api/tournament/join", {
        code: roomCode,
        displayName: nameDraft,
        sessionId,
      });

      setDisplayName(nameDraft);
      setRoom(nextRoom);
      setIsEditingName(false);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not update your name.");
    } finally {
      setSubmitting(false);
    }
  }

  function navigateToRoom(nextRoomCode: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("room", nextRoomCode);
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function handleCopyRoomLink() {
    if (!roomCode) {
      return;
    }

    const roomUrl = `${window.location.origin}${pathname}?room=${roomCode}`;
    await navigator.clipboard.writeText(roomUrl);
    setCopyStatus("Room link copied.");
  }

  async function runRoomMutation(url: string, body: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);

    try {
      const nextRoom = await postRoomAction(url, body);
      setRoom(nextRoom);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Could not update room.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!backendConfigured) {
    return (
      <div className="space-y-4 rounded-[1.5rem] border border-red-400/20 bg-red-500/10 p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-red-200/80">
            Supabase Setup Required
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Tournament lobby is ready, but the backend is not configured yet.</h2>
        </div>

        <p className="max-w-3xl text-sm leading-6 text-red-50/85 sm:text-base">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run the SQL in `supabase/tournament-schema.sql`.
        </p>
      </div>
    );
  }

  if (!roomCode || !roomState || !activeRoom) {
    return (
      <div className="space-y-5">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/80">
            Multiplayer Bracket Lobby
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Build a room, invite everyone, and vote each matchup down to one winner.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Build a movie-only bracket from your rated list or search the broader movie database. Every device joins the same room, votes live, and the host breaks ties when the matchup lands even.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <form
            onSubmit={handleCreateRoom}
            className="space-y-4 rounded-[1.5rem] border border-white/10 bg-[#120c24] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/80">
                Create Room
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">Seed a bracket and become the host.</h3>
            </div>

            <label className="block space-y-2 text-sm text-slate-200">
              <span>Your display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-violet-300/45"
                placeholder="Jose"
              />
            </label>

            <label className="block space-y-2 text-sm text-slate-200">
              <span>Room title</span>
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-violet-300/45"
                placeholder="Best Sci-Fi Movie"
              />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="block flex-1 space-y-2 text-sm text-slate-200">
                  <span>{movieSearchTab === "rated" ? "Search rated movies" : "Search all movies"}</span>
                  <input
                    value={movieSearch}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setMovieSearch(nextValue);

                      if (movieSearchTab === "all" && nextValue.trim().length < 2) {
                        setRemoteMovies([]);
                        setRemoteMoviesQuery("");
                      }
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-violet-300/45"
                    placeholder={
                      movieSearchTab === "rated"
                        ? "Search Jose's rated movies"
                        : "Search TMDb movie catalog"
                    }
                  />
                </label>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    Selected
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">{selectedMovies.length}</p>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/35 p-3">
                <div className="mb-3 flex flex-wrap gap-2">
                  {([
                    ["rated", "My Rated Movies"],
                    ["all", "All Movies"],
                  ] as const).map(([tabId, label]) => {
                    const isActive = movieSearchTab === tabId;

                    return (
                      <button
                        key={tabId}
                        type="button"
                        onClick={() => {
                          setMovieSearchTab(tabId);
                          setMovieSearch("");
                          setRemoteMovies([]);
                          setRemoteMoviesQuery("");
                          setError(null);
                        }}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          isActive
                            ? "border border-violet-300/40 bg-violet-300/12 text-violet-100"
                            : "border border-white/10 bg-slate-950/30 text-slate-300 hover:border-white/20 hover:bg-white/6"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {movieSearchTab === "rated" && loadingMovies ? (
                  <p className="text-sm text-slate-300">Loading your movie catalog...</p>
                ) : movieSearchTab === "rated" && filteredMovies.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {filteredMovies.map((movie) => (
                      <button
                        key={getMovieKey(movie.name, movie.year)}
                        type="button"
                        onClick={() => handleAddMovie(movie)}
                        className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 p-2.5 text-left transition hover:border-violet-300/35 hover:bg-white/8"
                      >
                        <PosterThumb
                          title={movie.name}
                          posterUrl={movie.posterUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{movie.name}</p>
                          <p className="text-xs text-slate-400">{movie.year ?? "Unknown year"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : movieSearchTab === "all" && searchingRemoteMovies ? (
                  <p className="text-sm text-slate-300">Searching all movies...</p>
                ) : movieSearchTab === "all" && filteredRemoteMovies.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {filteredRemoteMovies.map((movie) => (
                      <button
                        key={getMovieSelectionKey(movie)}
                        type="button"
                        onClick={() => handleAddRemoteMovie(movie)}
                        className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 p-2.5 text-left transition hover:border-violet-300/35 hover:bg-white/8"
                      >
                        <PosterThumb
                          title={movie.label}
                          posterUrl={movie.posterUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{movie.label}</p>
                          <p className="text-xs text-slate-400">{movie.year ?? "Unknown year"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-300">
                    {movieSearchTab === "rated"
                      ? movieSearchValue
                        ? "No rated movies matched that search."
                        : "All currently available rated movies are already selected."
                      : movieSearchValue.length < 2
                        ? "Type at least 2 characters to search all movies."
                        : "No movies matched that search."}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-200">Bracket picks</p>
                  {selectedMovies.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedMovies([])}
                      className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400 transition hover:text-white"
                    >
                      Clear All
                    </button>
                  ) : null}
                </div>

                {selectedMovies.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {selectedMovies.map((movie) => (
                      <div
                        key={`selected-${getMovieSelectionKey(movie)}`}
                        className="overflow-hidden rounded-[1.15rem] border border-white/10 bg-slate-950/45"
                      >
                        <div className="flex items-center gap-3 p-2.5">
                          <PosterThumb
                            title={movie.label}
                            posterUrl={movie.posterUrl}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium text-white">{movie.label}</p>
                            <p className="mt-1 text-xs text-slate-400">{movie.year ?? "Unknown year"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMovie(movie)}
                          className="w-full border-t border-white/8 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/6 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.2rem] border border-dashed border-white/12 bg-slate-950/25 px-4 py-5 text-sm text-slate-400">
                    Add 4, 8, or 16 movies to build the bracket.
                  </div>
                )}
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-400">
              Valid bracket sizes are 4, 8, or 16 movies. Use your rated list for quick picks or search the full TMDb movie database for anything else.
            </p>

            <button
              type="submit"
              disabled={submitting || ![4, 8, 16].includes(selectedMovies.length)}
              className="rounded-full bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating Room..." : "Create Tournament Room"}
            </button>
          </form>

          <form
            onSubmit={handleJoinRoom}
            className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-amber-200/80">
                Join Room
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">Jump into an existing bracket by code.</h3>
            </div>

            <label className="block space-y-2 text-sm text-slate-200">
              <span>Your display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-amber-300/45"
                placeholder="Matt"
              />
            </label>

            <label className="block space-y-2 text-sm text-slate-200">
              <span>Room code</span>
              <input
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 font-mono uppercase tracking-[0.22em] text-white outline-none transition focus:border-amber-300/45"
                placeholder="AB12CD"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Joining..." : "Join Tournament Room"}
            </button>
          </form>
        </div>

        {error ? (
          <div className="rounded-[1.35rem] border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.18),_transparent_55%),rgba(255,255,255,0.04)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/80">
                Room {activeRoom.code}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{roomState.title}</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyRoomLink}
                className="rounded-full border border-white/15 bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-slate-950/60"
              >
                Copy Invite Link
              </button>
              {isHost && roomState.status === "setup" ? (
                <button
                  type="button"
                  onClick={handleStartTournament}
                  disabled={submitting}
                  className="rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Start Bracket
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Status" value={roomState.status === "live" ? "Live" : roomState.status === "finished" ? "Finished" : "Setup"} />
            <StatCard label="Players" value={String(roomState.players.length)} />
            <StatCard label="Entries" value={String(roomState.entries.length)} />
          </div>

          <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-slate-950/35 p-4">
            <p className="text-sm leading-6 text-slate-200">{statusMessage}</p>
            {copyStatus ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-violet-200/80">
                {copyStatus}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-[1.35rem] border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
            Players
          </p>
          <div className="mt-3 rounded-[1.25rem] border border-white/8 bg-slate-950/30 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Your Name
                </p>
                <p className="mt-1 font-medium text-white">
                  {(currentUser?.name ?? displayName) || "Not set yet"}
                </p>
              </div>

              {!isEditingName ? (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(currentUser?.name ?? displayName);
                    setIsEditingName(true);
                  }}
                  className="rounded-full border border-white/12 bg-slate-950/45 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/28 hover:bg-slate-900/70"
                >
                  Edit Name
                </button>
              ) : null}
            </div>

            {isEditingName ? (
              <form onSubmit={handleRenamePlayer} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-white outline-none transition focus:border-violet-300/45"
                  placeholder="Enter your name"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(displayName);
                      setIsEditingName(false);
                    }}
                    className="rounded-full border border-white/12 bg-slate-950/45 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/28 hover:bg-slate-900/70"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {roomState.players.map((player) => (
              <div
                key={player.sessionId}
                className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/30 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-white">{player.name}</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    {player.sessionId === sessionId ? "You" : "Player"}
                  </p>
                </div>
                {player.isHost ? (
                  <span className="rounded-full border border-violet-300/35 bg-violet-400/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100">
                    Host
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {currentMatch && roomState.status === "live" ? (
        <div className="rounded-[1.5rem] border border-white/10 bg-[#120c24] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/80">
                Active Matchup
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                {leftEntry?.label ?? "TBD"} vs {rightEntry?.label ?? "TBD"}
              </h3>
            </div>

            {isHost && currentMatch.status === "voting" && currentMatch.votes.length > 0 ? (
              <button
                type="button"
                onClick={handleCloseVoting}
                disabled={submitting}
                className="rounded-full border border-white/15 bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-slate-950/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close Voting
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[leftEntry, rightEntry].map((entry) => {
              if (!entry) {
                return null;
              }

              const voteCount = currentVoteSummary?.counts[entry.id] ?? 0;
              const isSelected = currentUserVote?.entryId === entry.id;

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleVote(entry.id)}
                  disabled={submitting || currentMatch.status !== "voting"}
                  className={`overflow-hidden rounded-[1.35rem] border text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${
                    isSelected
                      ? "border-amber-300/45 bg-amber-300/10"
                      : "border-white/10 bg-slate-950/35 hover:border-violet-300/35 hover:bg-white/7"
                  }`}
                >
                  <div className="grid min-h-[250px] grid-cols-[120px_minmax(0,1fr)] sm:min-h-[320px] sm:grid-cols-[180px_minmax(0,1fr)]">
                    <PosterThumb title={entry.label} posterUrl={entry.posterUrl} size="matchup" />
                    <div className="flex flex-col p-4 sm:p-5">
                      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
                        {isSelected ? "Your Vote" : "Vote Option"}
                      </p>
                      <h4 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                        {entry.label}
                      </h4>
                      <p className="mt-2 text-sm text-slate-400">
                        {entry.year ?? "Unknown year"}
                      </p>
                      <p className="mt-auto pt-4 text-sm text-slate-300">
                        {voteCount} vote{voteCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {currentMatch.status === "tie" && isHost ? (
            <div className="mt-4 rounded-[1.35rem] border border-amber-300/25 bg-amber-300/10 p-4">
              <p className="text-sm font-medium text-amber-50">Tie break needed. Pick the winner below.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[leftEntry, rightEntry].map((entry) =>
                  entry ? (
                    <button
                      key={`tiebreak-${entry.id}`}
                      type="button"
                      onClick={() => handleTieBreak(entry.id)}
                      disabled={submitting}
                      className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Advance {entry.label}
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {roomState.status === "finished" && champion ? (
        <div className="rounded-[1.5rem] border border-emerald-300/30 bg-emerald-400/12 p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-emerald-200/80">
            Champion
          </p>
          <h3 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{champion.label}</h3>
        </div>
      ) : null}

      <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
              Bracket
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white sm:text-2xl">Single-elimination bracket</h3>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Matchups advance in order. When votes tie, the host picks the winner for that round and the bracket continues.
          </p>
        </div>

        <TournamentBracket roomState={roomState} />
      </div>
    </div>
  );
}

function getOrCreateTournamentSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const storedSessionId = window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);

  if (storedSessionId) {
    return storedSessionId;
  }

  const nextSessionId = crypto.randomUUID();
  window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}

function getStoredTournamentName() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "";
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/35 p-3.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function PosterThumb({
  title,
  posterUrl,
  size,
}: {
  title: string;
  posterUrl?: string;
  size: "sm" | "matchup";
}) {
  const dimensions =
    size === "sm"
      ? "relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900/80"
      : "relative h-full min-h-[250px] overflow-hidden bg-slate-900/80 sm:min-h-[320px]";

  return (
    <div className={dimensions}>
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt={`${title} poster`}
          fill
          sizes={size === "sm" ? "48px" : "(max-width: 767px) 120px, 180px"}
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-950 px-3 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400 sm:text-xs">
          No Poster
        </div>
      )}
    </div>
  );
}

function getMovieSelectionKey(movie: TournamentMovieSelection) {
  return movie.tmdbId ? `tmdb:${movie.tmdbId}` : getMovieKey(movie.label, movie.year);
}

async function postRoomAction(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiRoomResponse;

  if (!response.ok || !payload.room) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload.room;
}
