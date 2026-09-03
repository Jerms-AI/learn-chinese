import { describe, it, expect } from "vitest";
import { tokenFor, isAuthorized, passcodeMatches, isPublicPath } from "@/lib/auth/passcode";

describe("passcode gate", () => {
  it("derives a stable, passcode-specific token that is not the passcode", async () => {
    const t1 = await tokenFor("open-sesame");
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t1).toBe(await tokenFor("open-sesame"));
    expect(t1).not.toBe(await tokenFor("open-sesame2"));
    expect(t1).not.toContain("sesame");
  });

  it("authorizes only the matching cookie", async () => {
    const good = await tokenFor("pc");
    expect(await isAuthorized(good, "pc")).toBe(true);
    expect(await isAuthorized(good, "other")).toBe(false);
    expect(await isAuthorized(undefined, "pc")).toBe(false);
    expect(await isAuthorized("", "pc")).toBe(false);
    expect(await isAuthorized("pc", "pc")).toBe(false); // raw passcode is not a token
  });

  it("matches submitted passcodes exactly", () => {
    expect(passcodeMatches("abc", "abc")).toBe(true);
    expect(passcodeMatches("abc ", "abc")).toBe(false);
    expect(passcodeMatches("", "abc")).toBe(false);
  });

  it("keeps the unlock flow and static assets public, everything else gated", () => {
    for (const p of ["/unlock", "/api/unlock", "/_next/static/x.js", "/favicon.ico"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/api/turn", "/api/transcribe", "/playground"]) expect(isPublicPath(p)).toBe(false);
  });
});
