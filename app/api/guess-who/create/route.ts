import { NextResponse } from "next/server";

import { createGuessWhoRoom } from "@/lib/guess-who-room-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      displayName?: string;
      sessionId?: string;
      categoryId?: string;
      boardSize?: number;
      seed?: string;
    };
    const room = await createGuessWhoRoom({
      title: body.title ?? "",
      displayName: body.displayName ?? "",
      sessionId: body.sessionId ?? "",
      categoryId: body.categoryId ?? "",
      boardSize: Number(body.boardSize ?? 0),
      seed: body.seed ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create room." },
      { status: 400 },
    );
  }
}
