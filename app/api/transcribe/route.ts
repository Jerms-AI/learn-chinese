import { NextRequest, NextResponse } from "next/server";
import { transcribeMandarin } from "@/lib/providers/azure-transcribe";
import { transcodeToPcm16k } from "@/lib/audio/transcode";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audioFile = form.get("audio") as File | null;

  if (!process.env.AZURE_SPEECH_KEY) {
    // Mock: pretend the user said something generic.
    return NextResponse.json({ transcript: "[mock transcript]" });
  }

  if (!audioFile) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  const webm = Buffer.from(await audioFile.arrayBuffer());
  const pcm = await transcodeToPcm16k(webm);
  const transcript = await transcribeMandarin(pcm);
  return NextResponse.json({ transcript });
}
