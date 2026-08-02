import { NextResponse } from "next/server";

import { getGuessWhoRoom } from "@/lib/guess-who-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const room = await getGuessWhoRoom(code);
    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load room." },
      { status: 404 },
    );
  }
}
