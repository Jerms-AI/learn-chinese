import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { synthesizeMandarin, synthesizeBilingual } from "@/lib/providers/azure-tts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { text, rate, bilingual } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  if (!process.env.AZURE_SPEECH_KEY) {
    const bytes = await readFile(path.join(process.cwd(), "public", "mocks", "silence.mp3"));
    return new NextResponse(bytes, { headers: { "Content-Type": "audio/mpeg", "X-TTS-Mode": "mock" } });
  }

  // bilingual: two voices in one clip — English coaching in a native American
  // voice, hanzi examples in the usual Chinese voice (tutor tips).
  const audio = bilingual === true
    ? await synthesizeBilingual(text)
    : await synthesizeMandarin(text, { rate: typeof rate === "number" ? rate : undefined });
  return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
}
