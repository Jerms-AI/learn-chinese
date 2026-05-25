import { describe, it, expect, beforeAll } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

// jsdom doesn't ship MediaRecorder; stub it.
class FakeMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["fake"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

describe("useMicRecorder", () => {
  beforeAll(() => {
    // @ts-expect-error stub
    globalThis.MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] }) },
      configurable: true,
    });
  });

  it("starts and stops, yielding a Blob", async () => {
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.isRecording).toBe(true);
    let blob: Blob | null = null;
    await act(async () => { blob = await result.current.stop(); });
    expect(blob).toBeInstanceOf(Blob);
    expect(result.current.isRecording).toBe(false);
  });
});
