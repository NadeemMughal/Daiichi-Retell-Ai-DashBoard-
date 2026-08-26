import { describe, expect, it } from "vitest";
import { summarizeManualUsage } from "./manual-invoice";

describe("manual invoice usage summary", () => {
  it("aggregates call milliseconds and chat AI messages on the server", () => {
    expect(summarizeManualUsage({ callDurationsMs: [60_000, 90_500], chatAiMessageCounts: [2, 3] })).toEqual({ callCount: 2, voiceSeconds: 151, chatAiMessages: 5 });
  });
  it("rejects negative provider quantities", () => {
    expect(() => summarizeManualUsage({ callDurationsMs: [-1], chatAiMessageCounts: [] })).toThrow();
  });
});

