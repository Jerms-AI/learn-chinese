import { describe, it, expect } from "vitest";
import { pickRecorderMimeType } from "@/lib/audio/use-mic-recorder";

describe("pickRecorderMimeType", () => {
  it("prefers webm/opus where supported (Chrome/Firefox/Android)", () => {
    expect(pickRecorderMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
  });
  it("falls back to audio/mp4 on iOS Safari", () => {
    expect(pickRecorderMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });
  it("defaults to webm when the browser can't be asked", () => {
    expect(pickRecorderMimeType(undefined)).toBe("audio/webm");
    expect(pickRecorderMimeType(() => false)).toBe("audio/webm");
  });
});
