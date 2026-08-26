import { z } from "zod";

export const manualInvoiceInput = z.object({
  callDurationsMs: z.array(z.number().int().nonnegative()),
  chatAiMessageCounts: z.array(z.number().int().nonnegative())
});

export function summarizeManualUsage(input: z.infer<typeof manualInvoiceInput>) {
  const parsed = manualInvoiceInput.parse(input);
  return {
    callCount: parsed.callDurationsMs.length,
    voiceSeconds: Math.round(parsed.callDurationsMs.reduce((sum, duration) => sum + duration, 0) / 1000),
    chatAiMessages: parsed.chatAiMessageCounts.reduce((sum, count) => sum + count, 0)
  };
}

