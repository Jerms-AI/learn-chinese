import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { synthesizeMandarin } from "@/lib/providers/azure-tts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { text, rate } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  if (!process.env.AZURE_SPEECH_KEY) {
    const bytes = await readFile(path.join(process.cwd(), "public", "mocks", "silence.mp3"));
    return new NextResponse(bytes, { headers: { "Content-Type": "audio/mpeg", "X-TTS-Mode": "mock" } });
  }

  const audio = await synthesizeMandarin(text, { rate: typeof rate === "number" ? rate : undefined });
  return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
}
