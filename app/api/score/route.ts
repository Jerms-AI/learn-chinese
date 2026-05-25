import { NextRequest, NextResponse } from "next/server";
import { mockScore } from "./mock";
import { scorePronunciation } from "@/lib/providers/azure-pronunciation";
import { transcodeToPcm16k } from "@/lib/audio/transcode";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const referenceText = String(form.get("referenceText") ?? "");
  const audioFile = form.get("audio") as File | null;

  if (!process.env.AZURE_SPEECH_KEY) {
    return NextResponse.json({ transcript: referenceText, ...mockScore({ referenceText }) });
  }

  if (!audioFile) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  const webm = Buffer.from(await audioFile.arrayBuffer());
  const pcm = await transcodeToPcm16k(webm);
  const result = await scorePronunciation(pcm, referenceText);
  return NextResponse.json(result);
}
