import { NextResponse } from "next/server";

import { serializeWavelengthRoomForSession } from "@/lib/wavelength";
import { submitWavelengthRoomClue } from "@/lib/wavelength-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      clueText?: string;
    };
    const { code } = await context.params;
    const room = await submitWavelengthRoomClue({
      code,
      sessionId: body.sessionId ?? "",
      clueText: body.clueText ?? "",
    });

    return NextResponse.json({ room: serializeWavelengthRoomForSession(room, body.sessionId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit the clue." },
      { status: 400 },
    );
  }
}
