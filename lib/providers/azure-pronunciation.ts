import "server-only";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { getAzureCreds } from "./azure-speech";

export type AzureWord = {
  Word: string;
  AccuracyScore?: number;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
};

export type AzureResponse = {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  Words?: AzureWord[];
};

export type NormalizedScore = {
  accuracy: number;
  fluency: number;
  completeness: number;
  tonesOk: boolean;
  words: Array<{ word: string; accuracy: number; tone?: number }>;
  transcript: string;
};

export function parseAzureResponse(raw: AzureResponse, transcript: string): NormalizedScore {
  const words = (raw.Words ?? []).map((w) => ({
    word: w.Word,
    accuracy: w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore ?? 0,
    tone: undefined as number | undefined,
  }));
  const tonesOk = words.every((w) => w.accuracy >= 60);
  return {
    accuracy: raw.AccuracyScore ?? 0,
    fluency: raw.FluencyScore ?? 0,
    completeness: raw.CompletenessScore ?? 0,
    tonesOk,
    words,
    transcript,
  };
}

export async function scorePronunciation(
  audio: Buffer,
  referenceText: string
): Promise<NormalizedScore> {
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
  const paConfig = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true
  );
  paConfig.applyTo(recognizer);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        const json = JSON.parse(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult));
        const nb = json?.NBest?.[0] ?? {};
        const pa = nb?.PronunciationAssessment ?? {};
        const raw: AzureResponse = {
          AccuracyScore: pa.AccuracyScore,
          FluencyScore: pa.FluencyScore,
          CompletenessScore: pa.CompletenessScore,
          Words: nb.Words,
        };
        recognizer.close();
        resolve(parseAzureResponse(raw, result.text ?? referenceText));
      },
      (err) => { recognizer.close(); reject(err); }
    );
  });
}
