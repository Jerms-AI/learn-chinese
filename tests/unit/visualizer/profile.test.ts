import { describe, it, expect } from "vitest";
import { clampProfile, DEFAULT_PROFILES, type Profile } from "@/lib/visualizer/profile";

describe("clampProfile", () => {
  it("clamps out-of-range numbers to their schema bounds", () => {
    const wild: Profile = {
      ...DEFAULT_PROFILES.idle,
      size: 9999,
      opacity: 5,
      glowStrength: -2,
    };
    const c = clampProfile(wild);
    expect(c.size).toBe(240);
    expect(c.opacity).toBe(1);
    expect(c.glowStrength).toBe(0);
  });

  it("rounds pointCount to an integer", () => {
    const c = clampProfile({ ...DEFAULT_PROFILES.idle, pointCount: 63.7 });
    expect(c.pointCount).toBe(64);
  });

  it("snaps an invalid shape back to a valid option", () => {
    // @ts-expect-error testing runtime validation of a bad enum value
    const c = clampProfile({ ...DEFAULT_PROFILES.idle, shape: "blob" });
    expect(["dot", "line", "triangle", "orb"]).toContain(c.shape);
  });

  it("leaves a valid profile unchanged", () => {
    const c = clampProfile(DEFAULT_PROFILES.listening);
    expect(c).toEqual(DEFAULT_PROFILES.listening);
  });
});
