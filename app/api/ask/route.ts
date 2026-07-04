import { NextRequest, NextResponse } from "next/server";
import { answerHowDoISay, type AskAnswer } from "@/lib/conversation/ask";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { question } = (await req.json()) as { question?: string };
  const trimmed = (question ?? "").trim();
  if (!trimmed) return NextResponse.json({ error: "question required" }, { status: 400 });

  // Mock fallback so the flow is exercisable without an API key.
  if (!process.env.ANTHROPIC_API_KEY) {
    const mock: AskAnswer = { hanzi: "水", pinyin: "shuǐ", english: "water", note: "mock answer — set ANTHROPIC_API_KEY" };
    return NextResponse.json({ answer: mock });
  }

  try {
    const answer = await answerHowDoISay(trimmed);
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: "could not answer" }, { status: 502 });
  }
}
