# 13 — API Specification

REST API exposed by `apps/api`. Základ: `/api/v1`. OpenAPI schéma bude generovaná z NestJS decorators (`@nestjs/swagger`) a publikovaná na `/api/v1/docs`.

## Konvencie

- **Base URL**: `https://agentx.example.com/api/v1`
- **Auth**: `Authorization: Bearer <access_token>` (JWT) pre user-facing endpointy; `X-API-Key: <key>` pre trigger endpointy.
- **Content**: `application/json` (okrem SSE ktorá je `text/event-stream`)
- **Error format** (RFC 7807 Problem Details):
  ```json
  {
    "type": "https://agentx.io/errors/validation",
    "title": "Validation failed",
    "status": 400,
    "detail": "...",
    "errors": [{ "path": "email", "message": "invalid email" }],
    "traceId": "abc123"
  }
  ```
- **Pagination**: cursor-based. Query: `?limit=20&cursor=<opaque>`. Response: `{ items, nextCursor }`.
- **Filtering**: query params per endpoint (`?status=running&agentId=...`).
- **Sorting**: `?sort=-createdAt` (- = desc).
- **Rate limits**: per-user + per-IP (štandardne 60 rq/min).
- **Idempotency**: POSTy ktoré vytvárajú resources akceptujú `Idempotency-Key` header.

## Modules

### Auth (`/auth`)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name }` | `{ user, accessToken }` + set refresh cookie | Create user + default org |
| POST | `/auth/login` | `{ email, password }` | `{ user, accessToken }` + set refresh cookie | |
| POST | `/auth/refresh` | — (cookie) | `{ accessToken }` + rotate cookie | |
| POST | `/auth/logout` | — | `204` + clear cookie | |
| GET | `/auth/me` | — | `{ user, orgs[] }` | Current user + memberships |

### Orgs (`/orgs`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/orgs` | — | `{ items: Org[] }` — orgs kde som member |
| POST | `/orgs` | `{ name }` | `Org` |
| GET | `/orgs/:id` | — | `Org` |
| PATCH | `/orgs/:id` | `{ name? }` | `Org` |
| DELETE | `/orgs/:id` | — | `204` — len owner |
| GET | `/orgs/:id/members` | — | `{ items: Member[] }` |
| POST | `/orgs/:id/members` | `{ email, role }` | `Invitation` (Phase 8: email; MVP: priamy add) |
| PATCH | `/orgs/:id/members/:userId` | `{ role }` | `Member` |
| DELETE | `/orgs/:id/members/:userId` | — | `204` |

Všetky endpointy skiper prvý vyžadujú `X-Org-Id` header alebo `?orgId=` query (scope resolver).

### Agents (`/agents`)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/agents` | — | `{ items: Agent[] }` | Filters: `?status=active` |
| POST | `/agents` | `AgentCreateDto` | `Agent` | Creates v1 automatically |
| GET | `/agents/:id` | — | `Agent` | Includes `currentVersion` |
| PATCH | `/agents/:id` | `AgentUpdateDto` | `Agent` | Creates new `agent_version` if config changes |
| DELETE | `/agents/:id` | — | `204` | Soft delete → `archived` |
| GET | `/agents/:id/versions` | — | `{ items: AgentVersion[] }` | |
| GET | `/agents/:id/versions/:versionId` | — | `AgentVersion` | |
| POST | `/agents/:id/duplicate` | `{ name }` | `Agent` | |

`AgentCreateDto`:
```ts
{
  name: string;
  description?: string;
  systemPrompt: string;
  modelProvider: "anthropic" | "openai" | "google";
  modelId: string;
  params?: { temperature?, maxTokens?, topP?, maxIterations?, maxCostUsd? };
  bindings?: AgentMcpBindingDto[];
}
```

### MCP Servers (`/mcp/servers`) — catalog

| Method | Path | Response | Notes |
|---|---|---|---|
| GET | `/mcp/servers` | `{ items: McpServer[] }` | Katalóg (shared, not org-scoped) |
| GET | `/mcp/servers/:slug` | `McpServer` | |
| POST | `/mcp/servers` | `McpServerDto` | Admin only; phase 2 |

### MCP Credentials (`/mcp/credentials`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/mcp/credentials` | — | `{ items }` — bez decrypted payload, len metadata |
| POST | `/mcp/credentials` | `{ mcpServerId, label, credentialType, payload }` | `Credential` — payload sa zašifruje |
| DELETE | `/mcp/credentials/:id` | — | `204` |
| POST | `/mcp/credentials/:id/test` | — | `{ ok, error? }` — testovací tool call |

### MCP OAuth (`/mcp/oauth`)

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/mcp/oauth/start` | `?mcpServerId=...&redirectTo=/credentials` | `302` → authUrl |
| GET | `/mcp/oauth/callback` | `?code=...&state=...` | `302` → `redirectTo` after storing credential |

### Agent MCP Bindings (`/agents/:id/bindings`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/agents/:id/bindings` | — | `{ items }` |
| POST | `/agents/:id/bindings` | `{ mcpServerId, credentialId?, allowedTools? }` | `Binding` |
| PATCH | `/agents/:id/bindings/:bindingId` | `{ credentialId?, allowedTools?, enabled? }` | `Binding` |
| DELETE | `/agents/:id/bindings/:bindingId` | — | `204` |

### Triggers (`/agents/:id/triggers` + `/triggers/:id`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/agents/:id/triggers` | — | `{ items }` |
| POST | `/agents/:id/triggers` | `{ type, name, config, enabled }` | `Trigger` |
| PATCH | `/triggers/:id` | `{ config?, enabled? }` | `Trigger` |
| DELETE | `/triggers/:id` | — | `204` |
| POST | `/triggers/:id/test` | `{ input? }` | `Run` — manual invocation |

### Webhook Trigger Endpoint (unauth by JWT, **X-API-Key only**)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/triggers/:id/invoke` | any JSON | **sync mode**: `{ executionId, output, tokens, cost }`. **async mode**: `{ executionId }` (202) |

### API Keys (`/api-keys`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api-keys` | — | `{ items }` — prefix only |
| POST | `/api-keys` | `{ name, triggerId?, orgScope? }` | `{ apiKey, ...metadata }` — plaintext viditeľný **iba raz** |
| DELETE | `/api-keys/:id` | — | `204` (revoke) |

### Executions (`/executions`)

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/executions` | `?agentId, ?status, ?from, ?to` | `{ items, nextCursor }` |
| GET | `/executions/:id` | — | `Execution` |
| GET | `/executions/:id/events` | `?sinceSeq` | **SSE** stream `text/event-stream` |
| POST | `/executions/:id/cancel` | — | `204` |
| POST | `/executions/:id/retry` | — | `Execution` — new execution from same input |
| POST | `/agents/:id/executions` | `{ input }` | `Execution` — manual ad-hoc |

### Chat (`/agents/:agentId/sessions` + `/sessions/:id`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/agents/:agentId/sessions` | — | `{ items }` |
| POST | `/agents/:agentId/sessions` | `{ title? }` | `Session` |
| GET | `/sessions/:id` | — | `Session` + messages |
| POST | `/sessions/:id/messages` | `{ content }` | `{ message, executionId }` — enqueues run; UI then SSE na `/executions/:executionId/events` |
| DELETE | `/sessions/:id` | — | `204` |

### Health & meta

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ status, version, db, redis }` |
| GET | `/version` | `{ version, commit }` |

## SSE event format

`text/event-stream` s `event:` line = ExecutionEvent type, `data:` line = JSON payload, `id:` line = seq.

```
id: 42
event: tool_call
data: {"id":"tc_x","name":"github__create_issue","args":{...}}

id: 43
event: tool_result
data: {"id":"tc_x","result":{...},"durationMs":234}
```

Klient pri reconnecte posiela `Last-Event-ID: 42` → server vráti history since 42.

## Versioning

- URL prefix `/api/v1`
- Breaking changes → `/api/v2`, old version podporovaná ≥ 6 mesiacov
- Deprecation: `Deprecation: true` header + `Sunset: <date>`

## Kedy generovať OpenAPI

- NestJS moduly majú `@ApiProperty()` / `@ApiResponse()` decorators
- `@nestjs/swagger` generuje JSON na `/api/v1/openapi.json`
- UI dokumentácia na `/api/v1/docs` (Swagger UI alebo Scalar)
- V CI: diff oproti predchádzajúcej verzii → blok ak breaking change bez version bumpu
