import { describe, it, expect } from "vitest";
import { parseClaudeJson } from "@/lib/conversation/claude-prompt";

describe("parseClaudeJson", () => {
  it("parses a bare JSON object", () => {
    const raw = '{"decision":"ai_speak","aiUtterance":{"hanzi":"你好","pinyin":"nǐ hǎo","english":"hello"}}';
    expect(parseClaudeJson(raw).decision).toBe("ai_speak");
  });

  it("tolerates markdown fencing", () => {
    const raw = '```json\n{"decision":"user_speak","confirm":"对"}\n```';
    expect(parseClaudeJson(raw).decision).toBe("user_speak");
  });
});
