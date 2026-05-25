import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MicButton } from "@/components/MicButton";

class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

beforeAll(() => {
  // @ts-expect-error stub
  globalThis.MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] }) },
    configurable: true,
  });
});

describe("<MicButton>", () => {
  it("calls onAudio with a Blob after press-and-release", async () => {
    const onAudio = vi.fn();
    render(<MicButton onAudio={onAudio} />);
    const btn = screen.getByRole("button", { name: /hold to talk/i });
    fireEvent.mouseDown(btn);
    await new Promise((r) => setTimeout(r, 30));
    fireEvent.mouseUp(btn);
    await new Promise((r) => setTimeout(r, 50));
    expect(onAudio).toHaveBeenCalled();
    expect(onAudio.mock.calls[0][0]).toBeInstanceOf(Blob);
  });
});
