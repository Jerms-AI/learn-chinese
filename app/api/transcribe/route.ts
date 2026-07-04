import { NextRequest, NextResponse } from "next/server";
import { transcribeSpeech } from "@/lib/providers/openai-transcribe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audioFile = form.get("audio") as File | null;
  // "zh" (default) for Mandarin answers; "en" for the ask-in-English flow.
  const lang = form.get("lang") === "en" ? "en" : "zh";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ transcript: lang === "en" ? "[mock english question]" : "[mock transcript]" });
  }

  if (!audioFile) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  const webm = Buffer.from(await audioFile.arrayBuffer());
  const transcript = await transcribeSpeech(webm, lang);
  return NextResponse.json({ transcript });
}
