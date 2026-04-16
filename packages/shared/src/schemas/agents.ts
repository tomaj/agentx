import { z } from "zod";

export const mcpBindingSchema = z.object({
  mcpServerId: z.string().uuid(),
  mcpServerSlug: z.string(),
  credentialId: z.string().uuid().nullable(),
  allowedTools: z.array(z.string()).nullable(),
  enabled: z.boolean(),
});

export const agentParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  maxIterations: z.number().positive().optional().default(25),
  maxCostUsd: z.number().positive().optional().default(5),
  hardTimeoutMs: z.number().positive().optional().default(600_000),
  parallelToolCalls: z.boolean().optional().default(true),
});

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1).max(50_000),
  modelProvider: z.enum(["anthropic"]).default("anthropic"),
  modelId: z.string(),
  params: agentParamsSchema.optional(),
  mcpBindings: z.array(mcpBindingSchema).optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export type CreateAgentDto = z.infer<typeof createAgentSchema>;
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;
export type McpBinding = z.infer<typeof mcpBindingSchema>;
export type AgentParams = z.infer<typeof agentParamsSchema>;
