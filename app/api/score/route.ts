import { NextRequest, NextResponse } from "next/server";
import { mockScore } from "./mock";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const referenceText = String(form.get("referenceText") ?? "");
  const useMock = !process.env.AZURE_SPEECH_KEY;
  if (useMock) {
    return NextResponse.json({ transcript: referenceText, ...mockScore({ referenceText }) });
  }
  return NextResponse.json({ error: "Azure scoring not yet implemented" }, { status: 501 });
}
