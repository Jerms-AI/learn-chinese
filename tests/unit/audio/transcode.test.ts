// @vitest-environment node
import { describe, it, expect } from "vitest";
import { transcodeToPcm16k } from "@/lib/audio/transcode";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe.skipIf(process.env.CI)("transcodeToPcm16k", () => {
  it("converts webm bytes to a WAV buffer", async () => {
    const input = await readFile(path.join(process.cwd(), "tests", "fixtures", "sample.webm")).catch(() => null);
    if (!input) return; // skip if fixture missing
    const out = await transcodeToPcm16k(input);
    expect(out.byteLength).toBeGreaterThan(44);
    expect(out.toString("ascii", 0, 4)).toBe("RIFF");
  });
});
