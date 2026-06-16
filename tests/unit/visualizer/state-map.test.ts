import { describe, it, expect } from "vitest";
import { deriveVisualizerState } from "@/lib/visualizer/state-map";

describe("deriveVisualizerState", () => {
  it("idle when nothing is happening", () => {
    expect(deriveVisualizerState({ recording: false, busy: false, speaking: false })).toBe("idle");
  });

  it("listening whenever recording, even if other flags are set", () => {
    expect(deriveVisualizerState({ recording: true, busy: true, speaking: true })).toBe("listening");
  });

  it("speaking wins over processing (both true while TTS plays)", () => {
    expect(deriveVisualizerState({ recording: false, busy: true, speaking: true })).toBe("speaking");
  });

  it("processing when busy but not speaking or recording", () => {
    expect(deriveVisualizerState({ recording: false, busy: true, speaking: false })).toBe("processing");
  });
});
