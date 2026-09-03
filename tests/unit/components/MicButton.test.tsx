import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MicButton } from "@/components/MicButton";

class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(() => {
  // @ts-expect-error stub
  globalThis.MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] }) },
    configurable: true,
  });
});

describe("<MicButton>", () => {
  it("calls onAudio with a Blob after pointer press-and-release (mouse + touch path)", async () => {
    const onAudio = vi.fn();
    render(<MicButton onAudio={onAudio} />);
    const btn = screen.getByRole("button", { name: /hold to talk/i });
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, pointerType: "touch" });
    await tick(30);
    fireEvent.pointerUp(btn, { pointerId: 1, pointerType: "touch" });
    await tick(50);
    expect(onAudio).toHaveBeenCalledTimes(1);
    expect(onAudio.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it("ignores the synthetic mouse events that follow a touch (no double start)", async () => {
    const onAudio = vi.fn();
    render(<MicButton onAudio={onAudio} />);
    const btn = screen.getByRole("button", { name: /hold to talk/i });
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1 });
    fireEvent.mouseDown(btn);
    await tick(30);
    fireEvent.pointerUp(btn, { pointerId: 1 });
    fireEvent.mouseUp(btn);
    await tick(50);
    expect(onAudio).toHaveBeenCalledTimes(1);
  });

  it("ends the hold on pointercancel (finger dragged into a scroll)", async () => {
    const onAudio = vi.fn();
    render(<MicButton onAudio={onAudio} />);
    const btn = screen.getByRole("button", { name: /hold to talk/i });
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1 });
    await tick(30);
    fireEvent.pointerCancel(btn, { pointerId: 1 });
    await tick(50);
    expect(onAudio).toHaveBeenCalledTimes(1);
  });

  it("has a touch 'ask in English' hold button that routes to onAsk", async () => {
    const onAudio = vi.fn();
    const onAsk = vi.fn();
    render(<MicButton onAudio={onAudio} onAsk={onAsk} />);
    const ask = screen.getByRole("button", { name: /hold to ask in english/i });
    fireEvent.pointerDown(ask, { button: 0, pointerId: 1 });
    await tick(30);
    fireEvent.pointerUp(ask, { pointerId: 1 });
    await tick(50);
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAudio).not.toHaveBeenCalled();
  });

  it("honours a release that lands before the cold mic finishes opening", async () => {
    let resolveStream: (s: unknown) => void = () => {};
    const slow = new Promise((r) => { resolveStream = r; });
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getUserMedia: () => slow },
      configurable: true,
    });
    const onAudio = vi.fn();
    render(<MicButton onAudio={onAudio} />);
    const btn = screen.getByRole("button", { name: /hold to talk/i });
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1 });
    await tick(20);
    fireEvent.pointerUp(btn, { pointerId: 1 }); // released while still opening
    await tick(20);
    expect(onAudio).not.toHaveBeenCalled();
    resolveStream({ getTracks: () => [{ stop: () => {}, readyState: "live" }] });
    await tick(80);
    expect(onAudio).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders no ask button without onAsk", () => {
    render(<MicButton onAudio={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /ask in english/i })).toBeNull();
  });
});
