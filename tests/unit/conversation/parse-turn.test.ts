import { describe, it, expect } from "vitest";
import { parseConversationalTurn } from "@/lib/conversation/orchestrator";

const UTTERANCE = { hanzi: "很好！", pinyin: "hěn hǎo!", english: "Great!" };

function raw(user?: object) {
  return JSON.stringify({ ...(user ? { user } : {}), utterance: UTTERANCE, usedPairIds: ["p1"] });
}

describe("parseConversationalTurn", () => {
  it("keeps the raw transcript as hanzi and takes pinyin/english from Claude", () => {
    const out = parseConversationalTurn(
      raw({ pinyin: "wǒ hěn hǎo", english: "I'm very well" }),
      "我很好",
    );
    expect(out.userAugmented).toEqual({
      hanzi: "我很好",
      pinyin: "wǒ hěn hǎo",
      english: "I'm very well",
    });
  });

  it("omits userAugmented when the user has not spoken", () => {
    const out = parseConversationalTurn(raw(), null);
    expect(out.userAugmented).toBeUndefined();
  });

  it("strips markdown fences around the JSON", () => {
    const fenced = "```json\n" + raw() + "\n```";
    const out = parseConversationalTurn(fenced, null);
    expect(out.utterance).toEqual(UTTERANCE);
  });

  it("falls back to a default utterance when fields are missing", () => {
    const out = parseConversationalTurn(JSON.stringify({ utterance: { hanzi: "好" } }), null);
    expect(out.utterance.english).toBeTruthy(); // default, not the partial
  });

  it("throws on non-JSON (caller catches and uses its fallback)", () => {
    expect(() => parseConversationalTurn("sorry, I cannot do that", null)).toThrow();
  });
});
