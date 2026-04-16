export const ExecutionStatus = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const TriggerType = {
  http: "http",
  chat: "chat",
  cron: "cron",
  manual: "manual",
} as const;
export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export const OrgMemberRole = {
  owner: "owner",
  admin: "admin",
  member: "member",
} as const;
export type OrgMemberRole = (typeof OrgMemberRole)[keyof typeof OrgMemberRole];

export const AgentStatus = {
  draft: "draft",
  active: "active",
  archived: "archived",
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export const McpAuthType = {
  none: "none",
  static_token: "static_token",
  oauth2: "oauth2",
} as const;
export type McpAuthType = (typeof McpAuthType)[keyof typeof McpAuthType];

export const McpTransport = {
  stdio: "stdio",
  http: "http",
  sse: "sse",
} as const;
export type McpTransport = (typeof McpTransport)[keyof typeof McpTransport];

export const SafetyTier = {
  safe: "safe",
  write: "write",
  destructive: "destructive",
} as const;
export type SafetyTier = (typeof SafetyTier)[keyof typeof SafetyTier];

export const CredentialType = {
  static_token: "static_token",
  oauth2: "oauth2",
} as const;
export type CredentialType = (typeof CredentialType)[keyof typeof CredentialType];

export const ExecutionEventType = {
  execution_started: "execution_started",
  llm_request: "llm_request",
  llm_chunk: "llm_chunk",
  llm_response: "llm_response",
  tool_call: "tool_call",
  tool_result: "tool_result",
  compaction: "compaction",
  tool_result_truncated: "tool_result_truncated",
  log: "log",
  error: "error",
  execution_completed: "execution_completed",
} as const;
export type ExecutionEventType = (typeof ExecutionEventType)[keyof typeof ExecutionEventType];
