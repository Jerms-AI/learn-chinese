import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  const useMock = !process.env.AZURE_SPEECH_KEY;
  if (useMock) {
    const bytes = await readFile(path.join(process.cwd(), "public", "mocks", "silence.mp3"));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-TTS-Mode": "mock",
        "X-TTS-Text": encodeURIComponent(text ?? ""),
      },
    });
  }
  return NextResponse.json({ error: "Azure TTS not yet implemented" }, { status: 501 });
}
