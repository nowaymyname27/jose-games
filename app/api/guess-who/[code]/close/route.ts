import { NextResponse } from "next/server";

import { closeGuessWhoRoom } from "@/lib/guess-who-room-store";

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

    await closeGuessWhoRoom({
      code,
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not close room." },
      { status: 400 },
    );
  }
}
