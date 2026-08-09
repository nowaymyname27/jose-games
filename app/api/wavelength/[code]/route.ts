import { NextResponse } from "next/server";

import { getWavelengthRoomForSession } from "@/lib/wavelength-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const sessionId = new URL(request.url).searchParams.get("session");
    const room = await getWavelengthRoomForSession(code, sessionId);
    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load room." },
      { status: 404 },
    );
  }
}
