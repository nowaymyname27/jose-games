import { NextResponse } from "next/server";

import { serializeWavelengthRoomForSession } from "@/lib/wavelength";
import { selectWavelengthRoomSpectrum } from "@/lib/wavelength-room-store";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      optionId?: string;
      customLeftLabel?: string;
      customRightLabel?: string;
    };
    const { code } = await context.params;
    const room = await selectWavelengthRoomSpectrum({
      code,
      sessionId: body.sessionId ?? "",
      optionId: body.optionId ?? "",
      customLeftLabel: body.customLeftLabel,
      customRightLabel: body.customRightLabel,
    });

    return NextResponse.json({ room: serializeWavelengthRoomForSession(room, body.sessionId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not choose the spectrum." },
      { status: 400 },
    );
  }
}
