import { NextResponse } from "next/server";

import { voteInTournamentRoom } from "@/lib/tournament-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      entryId?: string;
    };
    const { code } = await context.params;
    const room = await voteInTournamentRoom({
      code,
      sessionId: body.sessionId ?? "",
      entryId: body.entryId ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record vote." },
      { status: 400 },
    );
  }
}
