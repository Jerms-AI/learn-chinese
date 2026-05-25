import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhraseCard } from "@/components/PhraseCard";

describe("<PhraseCard>", () => {
  const phrase = { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" };

  it("renders hanzi, pinyin, and english", () => {
    render(<PhraseCard phrase={phrase} />);
    expect(screen.getByText("你好吗?")).toBeInTheDocument();
    expect(screen.getByText("How are you?")).toBeInTheDocument();
  });

  it("calls onReplay when the speaker icon is clicked", async () => {
    let clicked = false;
    render(<PhraseCard phrase={phrase} onReplay={() => { clicked = true; }} />);
    const btn = screen.getByRole("button", { name: /replay/i });
    btn.click();
    expect(clicked).toBe(true);
  });
});
