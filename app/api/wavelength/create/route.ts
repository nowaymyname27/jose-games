import { NextResponse } from "next/server";

import { createWavelengthRoom } from "@/lib/wavelength-room-store";
import { serializeWavelengthRoomForSession } from "@/lib/wavelength";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      displayName?: string;
      sessionId?: string;
    };
    const room = await createWavelengthRoom({
      title: body.title ?? "",
      displayName: body.displayName ?? "",
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ room: serializeWavelengthRoomForSession(room, body.sessionId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create room." },
      { status: 400 },
    );
  }
}
