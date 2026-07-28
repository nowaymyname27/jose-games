import { NextResponse } from "next/server";

import { skipBlindRankRoomVote } from "@/lib/blind-rank-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
    };
    const { code } = await context.params;
    const room = await skipBlindRankRoomVote({
      code,
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not skip movie." },
      { status: 400 },
    );
  }
}
