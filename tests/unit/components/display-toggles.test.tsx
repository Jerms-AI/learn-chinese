import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhraseCard } from "@/components/PhraseCard";

const PHRASE = { hanzi: "你好", pinyin: "nǐ hǎo", english: "hello" };

describe("independent display layers", () => {
  it("hides only pinyin when hidePinyin", () => {
    render(<PhraseCard phrase={PHRASE} hidePinyin onTogglePinyin={() => {}} onToggleEnglish={() => {}} />);
    expect(screen.queryByText(/hǎo/)).toBeNull();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("hides only English when hideEnglish", () => {
    render(<PhraseCard phrase={PHRASE} hideEnglish onTogglePinyin={() => {}} onToggleEnglish={() => {}} />);
    expect(screen.queryByText("hello")).toBeNull();
    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("both hidden leaves hanzi only", () => {
    render(<PhraseCard phrase={PHRASE} hidePinyin hideEnglish />);
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.queryByText("hello")).toBeNull();
  });

  it("each chip fires its own toggle", () => {
    const onPin = vi.fn();
    const onEn = vi.fn();
    render(<PhraseCard phrase={PHRASE} onTogglePinyin={onPin} onToggleEnglish={onEn} />);
    fireEvent.click(screen.getByLabelText("Hide pinyin"));
    fireEvent.click(screen.getByLabelText("Hide English"));
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onEn).toHaveBeenCalledTimes(1);
  });
});
