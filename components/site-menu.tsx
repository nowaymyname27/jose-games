"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const GAMES = [
  {
    href: "/",
    label: "Movie Ratings",
  },
  {
    href: "/guess-who",
    label: "Guess Who?",
  },
  {
    href: "/tournament",
    label: "Tournament Lobby",
  },
  {
    href: "/d20",
    label: "D20 Roll Off",
  },
  {
    href: "/blind-rank",
    label: "Blind Rank",
  },
  {
    href: "/wavelength",
    label: "Wavelength",
  },
];

export default function SiteMenu() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        aria-label="Open games menu"
        aria-expanded={isOpen}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-slate-950/70 text-slate-100 transition hover:border-white/25 hover:bg-slate-900/80"
      >
        <span className="sr-only">Games menu</span>
        <span className="flex flex-col gap-1.5">
          <span className="block h-0.5 w-4 rounded-full bg-current" />
          <span className="block h-0.5 w-4 rounded-full bg-current" />
          <span className="block h-0.5 w-4 rounded-full bg-current" />
        </span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-14 z-50 min-w-52 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <p className="px-3 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
            Games
          </p>

          <div className="space-y-1">
            {GAMES.map((game) => {
              const isActive = pathname === game.href;

              return (
                <Link
                  key={game.href}
                  href={game.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-slate-200 hover:bg-white/6 hover:text-white"
                  }`}
                >
                  <span>{game.label}</span>
                  {isActive ? (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Here
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
