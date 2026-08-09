import { NextResponse } from "next/server";

import { serializeWavelengthRoomForSession } from "@/lib/wavelength";
import { submitWavelengthRoomGuess } from "@/lib/wavelength-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      position?: number;
    };
    const { code } = await context.params;
    const room = await submitWavelengthRoomGuess({
      code,
      sessionId: body.sessionId ?? "",
      position: Number(body.position ?? 50),
    });

    return NextResponse.json({ room: serializeWavelengthRoomForSession(room, body.sessionId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit the guess." },
      { status: 400 },
    );
  }
}
