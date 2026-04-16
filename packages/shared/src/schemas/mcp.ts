import { z } from "zod";

export const createMcpCredentialSchema = z.object({
  mcpServerId: z.string().uuid(),
  label: z.string().min(1).max(100),
  token: z.string().min(1),
});

export type CreateMcpCredentialDto = z.infer<typeof createMcpCredentialSchema>;

export const createMcpServerSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      "Slug must be lowercase alphanumeric with optional hyphens",
    ),
  name: z.string().min(1).max(120),
  description: z.string().max(500).default(""),
  transport: z.enum(["stdio", "http", "sse"]).default("stdio"),
  launchConfig: z
    .object({
      command: z.string().min(1),
      args: z.array(z.string()).default([]),
      env: z.record(z.string()).optional(),
    })
    .default({ command: "npx", args: [] }),
  authType: z.enum(["none", "static_token", "oauth2"]).default("none"),
  safetyTier: z.enum(["safe", "write", "destructive"]).default("safe"),
});

export type CreateMcpServerDto = z.infer<typeof createMcpServerSchema>;
