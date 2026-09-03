import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { TimerBar } from "@/components/TimerBar";

function bar(props: Partial<Parameters<typeof TimerBar>[0]> = {}) {
  return (
    <TimerBar
      active
      paused={false}
      durationMs={15000}
      onTimeout={() => {}}
      resetKey={0}
      {...props}
    />
  );
}

describe("TimerBar", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("fires onTimeout once after the duration when active", () => {
    const onTimeout = vi.fn();
    render(bar({ onTimeout }));
    vi.advanceTimersByTime(14999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20000);
    expect(onTimeout).toHaveBeenCalledTimes(1); // never refires
  });

  it("does not fire when inactive", () => {
    const onTimeout = vi.fn();
    render(bar({ active: false, onTimeout }));
    vi.advanceTimersByTime(30000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("pauses and RESUMES from remaining time — no restart", () => {
    const onTimeout = vi.fn();
    const { rerender } = render(bar({ onTimeout }));
    vi.advanceTimersByTime(10000);            // 10s elapsed, 5s remain
    rerender(bar({ onTimeout, paused: true }));
    vi.advanceTimersByTime(60000);            // long hold — frozen
    expect(onTimeout).not.toHaveBeenCalled();
    rerender(bar({ onTimeout, paused: false }));
    vi.advanceTimersByTime(4999);             // 5s remain, not 15
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("restarts the full countdown when resetKey changes (new question)", () => {
    const onTimeout = vi.fn();
    const { rerender } = render(bar({ onTimeout }));
    vi.advanceTimersByTime(10000);
    rerender(bar({ onTimeout, resetKey: 1 }));
    vi.advanceTimersByTime(14999); // almost full fresh window
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("cancels cleanly when deactivated mid-fill", () => {
    const onTimeout = vi.fn();
    const { rerender } = render(bar({ onTimeout }));
    vi.advanceTimersByTime(10000);
    rerender(bar({ onTimeout, active: false }));
    vi.advanceTimersByTime(30000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("renders nothing when inactive", () => {
    const { container } = render(bar({ active: false }));
    expect(container.firstChild).toBeNull();
  });
});
