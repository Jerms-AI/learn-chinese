import { NextRequest, NextResponse } from "next/server";
import { transcribeMandarin } from "@/lib/providers/openai-transcribe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audioFile = form.get("audio") as File | null;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ transcript: "[mock transcript]" });
  }

  if (!audioFile) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  const webm = Buffer.from(await audioFile.arrayBuffer());
  const transcript = await transcribeMandarin(webm);
  return NextResponse.json({ transcript });
}
