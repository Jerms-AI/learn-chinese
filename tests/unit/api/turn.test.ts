import { describe, it, expect } from "vitest";
import { runOrchestrator } from "@/lib/conversation/orchestrator";

describe("orchestrator (mock mode)", () => {
  it("returns an AI utterance when the user has not spoken yet", async () => {
    const res = await runOrchestrator({
      history: [],
      lastUserScore: null,
      activeDeckIds: ["fixture-mini"],
      metaIntent: null,
      mock: true,
    });
    expect(res.aiUtterance).toBeDefined();
    expect(res.aiUtterance?.hanzi).toBeTruthy();
    expect(res.routeTo).toBe("conversation");
  });

  it("routes to tutor when last score is below threshold", async () => {
    const res = await runOrchestrator({
      history: [
        { speaker: "ai", text: "你好吗?", phrase: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "?" }, at: 1 },
      ],
      lastUserScore: { accuracy: 40, completeness: 90, tonesOk: false, words: [{ word: "你", accuracy: 30, tone: 3 }] },
      activeDeckIds: ["fixture-mini"],
      metaIntent: null,
      mock: true,
    });
    expect(res.routeTo).toBe("tutor");
    expect(res.tutorPayload).toBeDefined();
    expect(res.tutorPayload?.targetWord).toBe("你");
  });
});
