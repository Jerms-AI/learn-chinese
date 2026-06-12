import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntroducedList } from "@/components/IntroducedList";
import type { LibraryEntry } from "@/lib/conversation/state";

const phraseLibrary: Record<string, LibraryEntry> = {
  first: { prompt: { hanzi: "你好", pinyin: "nǐ hǎo", english: "hello" } },
  second: { prompt: { hanzi: "再见", pinyin: "zài jiàn", english: "goodbye" } },
  third: { prompt: { hanzi: "谢谢", pinyin: "xiè xie", english: "thanks" } },
};

describe("IntroducedList", () => {
  it("stacks the most recently introduced phrase at the top", () => {
    render(
      <IntroducedList
        introducedIds={["first", "second", "third"]} // chronological in state
        phraseLibrary={phraseLibrary}
        mastery={{}}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("谢谢"); // newest first
    expect(items[2].textContent).toContain("你好"); // oldest last
  });
});
