import { z } from "zod";

export const sharedEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AGENTX_MASTER_KEY: z.string().min(32),
});

export const apiEnv = sharedEnv.extend({
  API_PORT: z.coerce.number().int().default(4000),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string().default("localhost"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
});

export const runnerEnv = sharedEnv.extend({
  ANTHROPIC_API_KEY: z.string().min(1),
  SANDBOX_MODE: z.enum(["folder", "docker"]).default("folder"),
  SANDBOX_WORKSPACE_ROOT: z.string().default("./workspaces"),
  SANDBOX_KEEP_WORKSPACES: z.coerce.boolean().default(false),
  RUN_DEFAULT_MAX_COST_USD: z.coerce.number().default(5),
  RUN_DEFAULT_MAX_ITERATIONS: z.coerce.number().int().default(25),
  RUN_DEFAULT_HARD_TIMEOUT_MS: z.coerce.number().int().default(600000),
  TOOL_CALL_DEFAULT_TIMEOUT_MS: z.coerce.number().int().default(60000),
});

export const webEnv = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000/api/v1"),
  NEXT_PUBLIC_APP_NAME: z.string().default("agentx"),
  WEB_INTERNAL_API_URL: z.string().url().default("http://localhost:4000/api/v1"),
});

export type SharedEnv = z.infer<typeof sharedEnv>;
export type ApiEnv = z.infer<typeof apiEnv>;
export type RunnerEnv = z.infer<typeof runnerEnv>;
export type WebEnv = z.infer<typeof webEnv>;
