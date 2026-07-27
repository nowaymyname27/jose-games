import { NextResponse } from "next/server";

import { createD20Room } from "@/lib/d20-room-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      displayName?: string;
      sessionId?: string;
    };
    const room = await createD20Room({
      title: body.title ?? "",
      displayName: body.displayName ?? "",
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create room." },
      { status: 400 },
    );
  }
}
