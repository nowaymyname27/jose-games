import { NextResponse } from "next/server";

import { voteInBlindRankRoom } from "@/lib/blind-rank-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      slot?: number;
    };
    const { code } = await context.params;
    const room = await voteInBlindRankRoom({
      code,
      sessionId: body.sessionId ?? "",
      slot: body.slot ?? 0,
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record vote." },
      { status: 400 },
    );
  }
}
