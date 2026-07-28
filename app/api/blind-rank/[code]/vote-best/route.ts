import { NextResponse } from "next/server";

import { voteForBestBlindRankBoard } from "@/lib/blind-rank-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      targetSessionId?: string;
    };
    const { code } = await context.params;
    const room = await voteForBestBlindRankBoard({
      code,
      sessionId: body.sessionId ?? "",
      targetSessionId: body.targetSessionId ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not vote for the best board." },
      { status: 400 },
    );
  }
}
