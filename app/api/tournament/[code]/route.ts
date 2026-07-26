import { NextResponse } from "next/server";

import { getTournamentRoom } from "@/lib/tournament-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const room = await getTournamentRoom(code);
    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load room." },
      { status: 404 },
    );
  }
}
