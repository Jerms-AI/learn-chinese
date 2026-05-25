import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TutorPanel } from "@/components/TutorPanel";

describe("<TutorPanel>", () => {
  const payload = {
    targetWord: "你",
    diagnosis: "Your tone slipped from rising to dipping. Try again.",
    referenceAudioUrl: "/mocks/silence.mp3",
    retryPrompt: "你",
  };

  it("shows the target word and diagnosis", () => {
    render(<TutorPanel payload={payload} onRetry={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("你")).toBeInTheDocument();
    expect(screen.getByText(/tone slipped/i)).toBeInTheDocument();
  });

  it("calls onSkip when 'skip' is clicked", () => {
    const onSkip = vi.fn();
    render(<TutorPanel payload={payload} onRetry={() => {}} onSkip={onSkip} />);
    screen.getByRole("button", { name: /skip/i }).click();
    expect(onSkip).toHaveBeenCalled();
  });
});
