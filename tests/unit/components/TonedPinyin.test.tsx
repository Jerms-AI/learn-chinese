import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TonedPinyin } from "@/components/TonedPinyin";

describe("<TonedPinyin>", () => {
  it("renders each syllable with a tone-N class", () => {
    const { container } = render(<TonedPinyin text="nǐ hǎo ma" />);
    const spans = container.querySelectorAll("span[data-tone]");
    expect(spans).toHaveLength(3);
    expect(spans[0].className).toContain("tone-3");
    expect(spans[1].className).toContain("tone-3");
    expect(spans[2].className).toContain("tone-5");
  });
});
