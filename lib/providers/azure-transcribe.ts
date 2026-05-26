import "server-only";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { getAzureCreds } from "./azure-speech";

/**
 * Speech-to-text without pronunciation assessment — just transcribes Mandarin
 * audio to text. Used for free-form user input where we don't have a reference
 * phrase to score against.
 */
export async function transcribeMandarin(audio: Buffer): Promise<string> {
  const { key, region } = getAzureCreds();
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = "zh-CN";

  const pushStream = sdk.AudioInputStream.createPushStream(
    sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
  );
  pushStream.write(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer);
  pushStream.close();

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        resolve(result.text ?? "");
      },
      (err) => { recognizer.close(); reject(err); }
    );
  });
}
