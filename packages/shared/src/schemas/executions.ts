import { z } from "zod";

export const executeAgentSchema = z.object({
  input: z.record(z.unknown()).optional(),
});

export type ExecuteAgentDto = z.infer<typeof executeAgentSchema>;
