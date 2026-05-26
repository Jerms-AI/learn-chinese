import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const CLAUDE_MODEL = "claude-sonnet-4-6";
/** Faster model for short free-form replies where quality is sufficient and latency
 * dominates UX. ~2-3x quicker than Sonnet on this kind of short structured output. */
export const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";
