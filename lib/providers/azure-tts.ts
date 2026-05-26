import "server-only";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { getAzureCreds } from "./azure-speech";

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

export async function synthesizeMandarin(
  text: string,
  opts: { voice?: string; rate?: number } = {}
): Promise<Buffer> {
  const voice = opts.voice ?? "zh-CN-XiaoxiaoNeural";
  const rate = opts.rate ?? 1.0;
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

  return new Promise((resolve, reject) => {
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
}
