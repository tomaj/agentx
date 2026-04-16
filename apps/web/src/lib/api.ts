const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string },
): Promise<T> {
  const { token, ...init } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      localStorage.removeItem("agentx_token");
      localStorage.removeItem("agentx_user");
      window.location.href = "/login";
    }
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}

export function login(email: string, password: string) {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(token: string) {
  return apiFetch<{ id: string; email: string; name: string; memberships: any[] }>("/auth/me", {
    token,
  });
}

// Agents
export interface Agent {
  id: string;
  agentId: string;
  orgId: string;
  name: string;
  description: string;
  status: string;
  version: number;
  isCurrent: boolean;
  systemPrompt: string;
  modelProvider: string;
  modelId: string;
  params: Record<string, any>;
  mcpBindings: any[];
  createdAt: string;
  updatedAt: string;
}

export function listAgents(token: string) {
  return apiFetch<Agent[]>("/agents", { token });
}

export function getAgent(token: string, agentId: string) {
  return apiFetch<Agent>(`/agents/${agentId}`, { token });
}

export function createAgent(
  token: string,
  data: { name: string; systemPrompt: string; modelId?: string },
) {
  return apiFetch<Agent>("/agents", {
    method: "POST",
    token,
    body: JSON.stringify({
      ...data,
      modelProvider: "anthropic",
      modelId: data.modelId ?? "claude-sonnet-4-6",
    }),
  });
}

export function updateAgent(token: string, agentId: string, data: Record<string, any>) {
  return apiFetch<Agent>(`/agents/${agentId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteAgent(token: string, agentId: string) {
  return apiFetch<void>(`/agents/${agentId}`, { method: "DELETE", token });
}

// Executions
export interface Execution {
  id: string;
  agentId: string;
  status: string;
  triggerType: string;
  input: any;
  output: any;
  error: any;
  startedAt: string;
  endedAt: string | null;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: string;
}

export interface ExecutionEvent {
  id: string;
  executionId: string;
  seq: number;
  timestamp: string;
  type: string;
  payload: Record<string, any>;
}

export function executeAgent(token: string, agentId: string, input?: Record<string, any>) {
  return apiFetch<Execution>(`/agents/${agentId}/execute`, {
    method: "POST",
    token,
    body: JSON.stringify({ input }),
  });
}

export function listExecutions(token: string, agentId?: string) {
  const qs = agentId ? `?agentId=${agentId}` : "";
  return apiFetch<Execution[]>(`/executions${qs}`, { token });
}

export function getExecution(token: string, executionId: string) {
  return apiFetch<Execution>(`/executions/${executionId}`, { token });
}

export function getExecutionEvents(token: string, executionId: string) {
  return apiFetch<ExecutionEvent[]>(`/executions/${executionId}/events`, { token });
}

// MCP
export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type: string; description?: string; items?: any }>;
    required?: string[];
  };
}

export interface McpServer {
  id: string;
  slug: string;
  name: string;
  description: string;
  transport: string;
  authType: string;
  safetyTier: string;
  requiresIsolation: boolean;
  isBuiltin: boolean;
  toolsCatalog: McpToolSchema[];
  createdAt: string;
  updatedAt: string;
}

export interface McpServerAgent {
  id: string;
  agentId: string;
  name: string;
  description: string;
  status: string;
  modelId: string;
  updatedAt: string;
}

export function listMcpServers(token: string) {
  return apiFetch<McpServer[]>("/mcp/servers", { token });
}

export function getMcpServer(token: string, slug: string) {
  return apiFetch<McpServer>(`/mcp/servers/${slug}`, { token });
}

export function getMcpServerAgents(token: string, slug: string) {
  return apiFetch<McpServerAgent[]>(`/mcp/servers/${slug}/agents`, { token });
}

export interface CreateMcpServerInput {
  slug: string;
  name: string;
  description?: string;
  transport?: "stdio" | "http" | "sse";
  launchConfig?: { command: string; args?: string[] };
  authType?: "none" | "static_token" | "oauth2";
  safetyTier?: "safe" | "write" | "destructive";
}

export function createMcpServer(token: string, data: CreateMcpServerInput) {
  return apiFetch<McpServer>("/mcp/servers", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function discoverMcpServerTools(token: string, slug: string) {
  return apiFetch<McpServer>(`/mcp/servers/${slug}/discover`, {
    method: "POST",
    token,
  });
}

// MCP Credentials
export interface McpCredential {
  id: string;
  mcpServerId: string;
  serverName: string;
  serverSlug: string;
  label: string;
  credentialType: string;
  createdAt: string;
}

export function listMcpCredentials(token: string) {
  return apiFetch<McpCredential[]>("/mcp/credentials", { token });
}

export function createMcpCredential(
  token: string,
  data: { mcpServerId: string; label: string; token: string },
) {
  return apiFetch<McpCredential>("/mcp/credentials", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteMcpCredential(token: string, id: string) {
  return apiFetch<void>(`/mcp/credentials/${id}`, { method: "DELETE", token });
}

// Chat
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sessionId: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  agentId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatStreamEvent {
  type: string;
  [key: string]: unknown;
}

export function listChatSessions(token: string, agentId: string) {
  return apiFetch<ChatSession[]>(`/agents/${agentId}/chat/sessions`, { token });
}

export function createChatSession(token: string, agentId: string, title?: string) {
  return apiFetch<ChatSession>(`/agents/${agentId}/chat/sessions`, {
    method: "POST",
    token,
    body: JSON.stringify({ title }),
  });
}

export function deleteChatSession(token: string, agentId: string, sessionId: string) {
  return apiFetch<void>(`/agents/${agentId}/chat/sessions/${sessionId}`, {
    method: "DELETE",
    token,
  });
}

export function getChatMessages(token: string, agentId: string, sessionId: string) {
  return apiFetch<ChatMessage[]>(`/agents/${agentId}/chat/sessions/${sessionId}/messages`, {
    token,
  });
}

export async function sendChatMessage(
  token: string,
  agentId: string,
  sessionId: string,
  message: string,
  onEvent: (event: ChatStreamEvent) => void,
) {
  const res = await fetch(`${API_URL}/agents/${agentId}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Chat request failed" }));
    onEvent({ type: "error", message: body.message ?? "Chat request failed" });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onEvent({ type: "error", message: "No response stream" });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        onEvent(data);
      } catch {
        // skip malformed lines
      }
    }
  }
}
