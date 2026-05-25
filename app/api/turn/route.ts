import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/conversation/orchestrator";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const useMock = process.env.NODE_ENV !== "production" && !process.env.ANTHROPIC_API_KEY;
  const result = await runOrchestrator({ ...body, mock: useMock });
  return NextResponse.json(result);
}
