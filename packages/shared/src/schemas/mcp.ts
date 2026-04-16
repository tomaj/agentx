import { z } from "zod";

export const createMcpCredentialSchema = z.object({
  mcpServerId: z.string().uuid(),
  label: z.string().min(1).max(100),
  token: z.string().min(1),
});

export type CreateMcpCredentialDto = z.infer<typeof createMcpCredentialSchema>;
