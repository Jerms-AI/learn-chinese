import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TutorPanel } from "@/components/TutorPanel";

const TARGET = { hanzi: "一点", pinyin: "yī diǎn", english: "one o'clock" };

describe("<TutorPanel>", () => {
  it("shows the target phrase: hanzi, pinyin, english", () => {
    render(<TutorPanel target={TARGET} deep={false} successes={0} required={2} tip={null} onReplay={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("一点")).toBeInTheDocument();
    expect(screen.getByText("one o'clock")).toBeInTheDocument();
  });

  it("shows progress dots toward the required successes", () => {
    render(<TutorPanel target={TARGET} deep={false} successes={1} required={2} tip={null} onReplay={() => {}} onSkip={() => {}} />);
    expect(screen.getByLabelText("1 of 2 successful repetitions")).toBeInTheDocument();
  });

  it("hides slow replay and tip outside deep mode", () => {
    render(<TutorPanel target={TARGET} deep={false} successes={0} required={2} tip={"unused"} onReplay={() => {}} onSkip={() => {}} />);
    expect(screen.queryByText(/slowly/)).toBeNull();
    expect(screen.queryByText("unused")).toBeNull();
  });

  it("deep mode: tip visible, slow replay calls onReplay(true)", () => {
    const onReplay = vi.fn();
    render(<TutorPanel target={TARGET} deep successes={0} required={2} tip={"Think 'dee-ahn'."} onReplay={onReplay} onSkip={() => {}} />);
    expect(screen.getByText("Think 'dee-ahn'.")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/slowly/));
    expect(onReplay).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText(/listen/));
    expect(onReplay).toHaveBeenCalledWith(false);
  });

  it("skip link fires onSkip", () => {
    const onSkip = vi.fn();
    render(<TutorPanel target={TARGET} deep={false} successes={0} required={2} tip={null} onReplay={() => {}} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("skip and move on"));
    expect(onSkip).toHaveBeenCalled();
  });
});
