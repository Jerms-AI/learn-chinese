import { describe, it, expect, beforeEach } from "vitest";
import { saveState, loadState, STORAGE_KEY } from "@/lib/conversation/persistence";
import { initialState, applyEvent } from "@/lib/conversation/state";

describe("persistence", () => {
  beforeEach(() => { localStorage.clear(); });

  it("round-trips initial state", () => {
    const s = initialState();
    saveState(s);
    expect(loadState()).toEqual(s);
  });

  it("returns null when nothing saved", () => {
    expect(loadState()).toBeNull();
  });

  it("survives a START event", () => {
    let s = initialState();
    s = applyEvent(s, { type: "START" });
    saveState(s);
    const loaded = loadState();
    expect(loaded?.mode).toBe("ai-speaking");
  });

  it("ignores corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState()).toBeNull();
  });
});
