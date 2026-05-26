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

  it("starts and stops, yielding a { blob, transcript } capture", async () => {
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.isRecording).toBe(true);
    let capture: { blob: Blob; transcript: string } | null = null;
    await act(async () => { capture = await result.current.stop(); });
    expect(capture!.blob).toBeInstanceOf(Blob);
    expect(typeof capture!.transcript).toBe("string");
    expect(result.current.isRecording).toBe(false);
  });
});
