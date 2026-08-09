import { NextResponse } from "next/server";

import { serializeWavelengthRoomForSession } from "@/lib/wavelength";
import { startWavelengthRoom } from "@/lib/wavelength-room-store";

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
    const room = await startWavelengthRoom({
      code,
      sessionId: body.sessionId ?? "",
    });

    return NextResponse.json({ room: serializeWavelengthRoomForSession(room, body.sessionId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the room." },
      { status: 400 },
    );
  }
}
