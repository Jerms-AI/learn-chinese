import { describe, it, expect, beforeEach, vi } from "vitest";
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

function makeFakeStream() {
  const track = { stop: vi.fn(), readyState: "live" as string };
  return {
    track,
    stream: { getTracks: () => [track] },
  };
}

describe("useMicRecorder", () => {
  let fake: ReturnType<typeof makeFakeStream>;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // @ts-expect-error stub
    globalThis.MediaRecorder = FakeMediaRecorder;
    fake = makeFakeStream();
    getUserMedia = vi.fn(() => Promise.resolve(fake.stream));
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getUserMedia },
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

  it("keeps the mic stream warm across recordings (single getUserMedia, no track stop)", async () => {
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });
    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(fake.track.stop).not.toHaveBeenCalled();
  });

  it("re-acquires the stream if its tracks have ended", async () => {
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });
    fake.track.readyState = "ended"; // e.g. user unplugged the mic
    await act(async () => { await result.current.start(); });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("releases the mic on unmount", async () => {
    const { result, unmount } = renderHook(() => useMicRecorder());
    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });
    unmount();
    expect(fake.track.stop).toHaveBeenCalled();
  });
});
