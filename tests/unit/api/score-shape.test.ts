import { describe, it, expect } from "vitest";
import { mockScore } from "@/app/api/score/mock";

describe("mockScore", () => {
  it("returns deterministic shape for a given reference text", () => {
    const s = mockScore({ referenceText: "你好" });
    expect(s.accuracy).toBeGreaterThanOrEqual(0);
    expect(s.accuracy).toBeLessThanOrEqual(100);
    expect(s.words.length).toBeGreaterThan(0);
    expect(s.words[0]).toHaveProperty("word");
    expect(s.words[0]).toHaveProperty("accuracy");
  });
});
