import "server-only";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath as string);

export function transcodeToPcm16k(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const inStream = Readable.from(input);
    ffmpeg(inStream)
      .inputFormat("webm")
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("wav")
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)))
      .pipe()
      .on("data", (c) => chunks.push(c));
  });
}
