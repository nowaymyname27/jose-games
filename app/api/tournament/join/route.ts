import { NextResponse } from "next/server";

import { joinTournamentRoom } from "@/lib/tournament-room-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      displayName?: string;
      sessionId?: string;
    };
    const room = await joinTournamentRoom({
      code: body.code ?? "",
      displayName: body.displayName ?? "",
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not join room." },
      { status: 400 },
    );
  }
}
