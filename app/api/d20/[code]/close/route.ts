import { NextResponse } from "next/server";

import { closeD20Room } from "@/lib/d20-room-store";

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

    await closeD20Room({
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
