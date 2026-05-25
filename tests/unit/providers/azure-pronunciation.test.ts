import { describe, it, expect } from "vitest";
import { parseAzureResponse, type AzureResponse } from "@/lib/providers/azure-pronunciation";
import fixture from "../../fixtures/azure-pronunciation-response.json";

describe("parseAzureResponse", () => {
  it("normalizes Azure JSON into our Score shape", () => {
    const s = parseAzureResponse(fixture as AzureResponse, "你好");
    expect(s.accuracy).toBe(87);
    expect(s.words).toHaveLength(2);
    expect(s.words[0]).toEqual({ word: "你", accuracy: 82, tone: undefined });
    expect(s.transcript).toBe("你好");
  });
});
