import { NextResponse } from "next/server";

import { createTournamentRoom } from "@/lib/tournament-room-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      entries?: Array<{
        label?: string;
        year?: number | null;
        posterUrl?: string;
        tmdbId?: number;
      }>;
      displayName?: string;
      sessionId?: string;
    };
    const room = await createTournamentRoom({
      title: body.title ?? "",
      entries:
        body.entries?.map((entry) => ({
          label: entry.label ?? "",
          year: entry.year,
          posterUrl: entry.posterUrl,
          tmdbId: entry.tmdbId,
        })) ?? [],
      displayName: body.displayName ?? "",
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create room." },
      { status: 400 },
    );
  }
}
