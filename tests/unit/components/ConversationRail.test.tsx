import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationRail } from "@/components/ConversationRail";
import type { Turn } from "@/lib/conversation/state";

const turns: Turn[] = [
  { speaker: "ai", text: "你好吗?", phrase: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" }, at: 1 },
  { speaker: "user", text: "我很好", score: { accuracy: 90, completeness: 100, tonesOk: true, words: [] }, at: 2 },
];

describe("<ConversationRail>", () => {
  it("renders every turn in order", () => {
    render(<ConversationRail turns={turns} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("flags user turns with accuracy score", () => {
    render(<ConversationRail turns={turns} />);
    expect(screen.getByText(/accuracy 90/i)).toBeInTheDocument();
  });
});
