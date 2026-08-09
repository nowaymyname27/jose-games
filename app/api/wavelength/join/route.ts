import { NextResponse } from "next/server";

import { joinWavelengthRoom } from "@/lib/wavelength-room-store";
import { serializeWavelengthRoomForSession } from "@/lib/wavelength";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      displayName?: string;
      sessionId?: string;
    };
    const room = await joinWavelengthRoom({
      code: body.code ?? "",
      displayName: body.displayName ?? "",
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ room: serializeWavelengthRoomForSession(room, body.sessionId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not join room." },
      { status: 400 },
    );
  }
}
