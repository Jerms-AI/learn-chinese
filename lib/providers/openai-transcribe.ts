import "server-only";
import OpenAI from "openai";

// gpt-4o-transcribe is OpenAI's newest STT model and outperforms whisper-1
// on non-English audio — including Mandarin tones. Falls back via the
// OPENAI_STT_MODEL env var if we want to A/B test against whisper-1.
const MODEL = process.env.OPENAI_STT_MODEL ?? "gpt-4o-transcribe";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/** @param language ISO-639-1 hint for the STT model. "zh" for the user's
 *  Mandarin answers (default); "en" for the "ask in English" flow, where the
 *  user speaks an English question and a "zh" hint would garble it. */
export async function transcribeSpeech(webm: Buffer, language: "zh" | "en" = "zh"): Promise<string> {
  // OpenAI's SDK accepts a web-standard File. webm is one of the supported
  // input formats so we can skip the ffmpeg→PCM transcode entirely.
  const file = new File([new Uint8Array(webm)], "speech.webm", { type: "audio/webm" });
  const res = await getClient().audio.transcriptions.create({
    file,
    model: MODEL,
    language,
  });
  return res.text;
}
