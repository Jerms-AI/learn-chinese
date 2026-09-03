import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPlayer, unlockPlayer, isUnlocked, installUnlockOnGesture, playOnPlayer, _resetPlayerForTests } from "@/lib/audio/player";

// jsdom's HTMLMediaElement.play/pause are unimplemented — stub them.
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();
Object.defineProperty(HTMLMediaElement.prototype, "play", { value: play, configurable: true });
Object.defineProperty(HTMLMediaElement.prototype, "pause", { value: pause, configurable: true });

beforeEach(() => { _resetPlayerForTests(); play.mockClear(); pause.mockClear(); play.mockImplementation(() => Promise.resolve()); });

describe("shared audio player", () => {
  it("is a single element reused across plays", async () => {
    const a = getPlayer();
    const p1 = playOnPlayer("blob:one");
    a!.dispatchEvent(new Event("ended"));
    await p1;
    const p2 = playOnPlayer("blob:two");
    a!.dispatchEvent(new Event("ended"));
    await p2;
    expect(getPlayer()).toBe(a);
    expect(play).toHaveBeenCalledTimes(2);
    expect(a!.getAttribute("src")).toBe("blob:two");
  });

  it("unlocks on the first gesture with a silent clip (play then pause), once", async () => {
    const remove = installUnlockOnGesture();
    window.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve(); await Promise.resolve();
    expect(isUnlocked()).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(getPlayer()!.src.startsWith("data:audio/wav")).toBe(true);
    window.dispatchEvent(new Event("pointerdown"));
    expect(play).toHaveBeenCalledTimes(1); // listener removed after success
    remove();
  });

  it("retries unlocking if the browser rejected the silent play", async () => {
    play.mockImplementationOnce(() => Promise.reject(new Error("NotAllowedError")));
    unlockPlayer();
    await Promise.resolve(); await Promise.resolve();
    expect(isUnlocked()).toBe(false);
    unlockPlayer();
    await Promise.resolve(); await Promise.resolve();
    expect(isUnlocked()).toBe(true);
  });

  it("resolves when play() is blocked so the conversation loop never hangs", async () => {
    play.mockImplementationOnce(() => Promise.reject(new Error("NotAllowedError")));
    const finish = vi.fn();
    await playOnPlayer("blob:x", { onFinish: finish });
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("calls onStart with the element before play and onFinish on ended", async () => {
    const order: string[] = [];
    const a = getPlayer()!;
    const p = playOnPlayer("blob:y", { onStart: (el) => order.push("start:" + (el === a)), onFinish: () => order.push("finish") });
    a.dispatchEvent(new Event("ended"));
    await p;
    expect(order).toEqual(["start:true", "finish"]);
  });
});
