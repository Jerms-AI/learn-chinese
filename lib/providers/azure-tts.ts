import "server-only";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { getAzureCreds } from "./azure-speech";

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

// In-memory TTS cache: scripted phrases repeat constantly across the loop and
// across users. Caching at (text, rate, voice) saves a 1-2s Azure round-trip
// per cached hit. Capped to MAX_ENTRIES to avoid unbounded growth (LRU-ish via
// insertion-order Map iteration).
const MAX_ENTRIES = 200;
const ttsCache = new Map<string, Buffer>();

function cacheKey(text: string, rate: number, voice: string): string {
  return `${voice}|${rate}|${text}`;
}

export async function synthesizeMandarin(
  text: string,
  opts: { voice?: string; rate?: number } = {}
): Promise<Buffer> {
  const voice = opts.voice ?? "zh-CN-XiaoxiaoNeural";
  const rate = opts.rate ?? 1.0;

  const ck = cacheKey(text, rate, voice);
  const cached = ttsCache.get(ck);
  if (cached) {
    // Bump to most-recent: delete + re-insert.
    ttsCache.delete(ck);
    ttsCache.set(ck, cached);
    return cached;
  }
  const { key, region } = getAzureCreds();
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

  // SSML when a non-default rate is requested (e.g. slower for tutor retries).
  const useSsml = rate !== 1.0;
  const ssml = useSsml
    ? `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`
    : null;

  const buf = await new Promise<Buffer>((resolve, reject) => {
    const cb = (result: sdk.SpeechSynthesisResult) => {
      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
        synthesizer.close();
        resolve(Buffer.from(result.audioData));
      } else {
        synthesizer.close();
        reject(new Error(`TTS failed: ${result.errorDetails}`));
      }
    };
    const errCb = (err: string) => { synthesizer.close(); reject(err); };
    if (useSsml && ssml) {
      synthesizer.speakSsmlAsync(ssml, cb, errCb);
    } else {
      synthesizer.speakTextAsync(text, cb, errCb);
    }
  });

  // Store in cache. Evict oldest if over cap.
  if (ttsCache.size >= MAX_ENTRIES) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey) ttsCache.delete(oldestKey);
  }
  ttsCache.set(ck, buf);
  return buf;
}
