import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetaBar } from "@/components/MetaBar";

describe("<MetaBar>", () => {
  it("fires onMeta with the chosen intent", async () => {
    const onMeta = vi.fn();
    render(<MetaBar onMeta={onMeta} />);
    screen.getByText(/slow down/i).click();
    expect(onMeta).toHaveBeenCalledWith("slow_down");
  });
});
