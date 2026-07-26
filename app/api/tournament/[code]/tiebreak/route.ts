import { NextResponse } from "next/server";

import { resolveTournamentTie } from "@/lib/tournament-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      winnerEntryId?: string;
    };
    const { code } = await context.params;
    const room = await resolveTournamentTie({
      code,
      sessionId: body.sessionId ?? "",
      winnerEntryId: body.winnerEntryId ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not resolve the tie." },
      { status: 400 },
    );
  }
}
