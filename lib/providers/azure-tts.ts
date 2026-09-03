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

const HAN = /\p{Script=Han}/u;
const CJK_PUNCT = /[，。！？、；：「」『』（）《》…·]/u;

export type BilingualSegment = { lang: "zh" | "en"; text: string };

/** Splits mixed coaching text into per-language runs so each can be spoken by
 * a native voice: hanzi (+ CJK punctuation) → the Chinese voice, everything
 * else → the American voice. Whitespace binds to the current run; boundary
 * whitespace is dropped (the voice handoff is its own natural pause). Pure —
 * exported for tests. */
export function segmentBilingual(text: string): BilingualSegment[] {
  const segs: BilingualSegment[] = [];
  let cur: BilingualSegment | null = null;
  let pendingWs = "";
  for (const ch of text) {
    if (/\s/.test(ch)) { pendingWs += ch; continue; }
    const lang: "zh" | "en" = HAN.test(ch) || CJK_PUNCT.test(ch) ? "zh" : "en";
    if (cur && cur.lang === lang) {
      cur.text += pendingWs + ch;
    } else {
      if (cur) segs.push(cur);
      cur = { lang, text: ch };
    }
    pendingWs = "";
  }
  if (cur) segs.push(cur);
  return segs.filter((s) => s.text.trim().length > 0);
}

const EN_VOICE = "en-US-JennyNeural";

/** Speaks mixed English+Chinese text with TWO voices in one clip: the English
 * coaching in a native American voice, the hanzi examples in the same Chinese
 * voice the learner hears everywhere else. Azure allows multiple <voice>
 * elements per SSML document. */
export async function synthesizeBilingual(
  text: string,
  opts: { zhVoice?: string } = {}
): Promise<Buffer> {
  const zhVoice = opts.zhVoice ?? "zh-CN-XiaoxiaoNeural";
  const ck = cacheKey(text, 1.0, `bilingual:${EN_VOICE}+${zhVoice}`);
  const cached = ttsCache.get(ck);
  if (cached) {
    ttsCache.delete(ck);
    ttsCache.set(ck, cached);
    return cached;
  }

  const body = segmentBilingual(text)
    .map((s) => `<voice name="${s.lang === "zh" ? zhVoice : EN_VOICE}">${escapeXml(s.text)}</voice>`)
    .join("");
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${body}</speak>`;

  const { key, region } = getAzureCreds();
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
  const buf = await new Promise<Buffer>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(Buffer.from(result.audioData));
        } else {
          reject(new Error(`bilingual TTS failed: ${result.errorDetails}`));
        }
      },
      (err) => { synthesizer.close(); reject(err); }
    );
  });

  if (ttsCache.size >= MAX_ENTRIES) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey) ttsCache.delete(oldestKey);
  }
  ttsCache.set(ck, buf);
  return buf;
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
