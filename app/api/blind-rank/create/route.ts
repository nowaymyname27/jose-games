import { NextResponse } from "next/server";

import { createBlindRankRoom } from "@/lib/blind-rank-room-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      displayName?: string;
      sessionId?: string;
      slotCount?: number;
      format?: string;
    };
    const room = await createBlindRankRoom({
      title: body.title ?? "",
      displayName: body.displayName ?? "",
      sessionId: body.sessionId ?? "",
      slotCount: body.slotCount ?? 10,
      format: body.format ?? "vote",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create room." },
      { status: 400 },
    );
  }
}
