# 04 — Data Model

Postgres + Drizzle. Všetky tabuľky majú `id uuid` (default `gen_random_uuid()`), `created_at`, `updated_at`. JSONB kde treba flexibilitu. pgvector extension pre embeddings.

## Entity diagram

```
 users ─┐
        ├── agents (versioned, immutable rows)
        │      │
        │      ├── triggers ── api_keys
        │      │
        │      └── chat_sessions ── messages
        │
        └── executions ─── execution_events
               │
               └── agents.id (snapshot verzia)

 mcp_servers (katalóg)
 mcp_credentials (per user/org × mcp_server)

 orgs ── org_members ── users

 agent_files ── file_chunks (pgvector embeddings)

 audit_log
```

## Hlavné rozhodnutie: agents = versioned immutable rows

Namiesto dvoch tabuliek (`agents` + `agent_versions`) máme **jednu tabuľku** `agents` kde:
- Každý riadok je **immutable verzia** agenta
- `agent_id` = logická identita (spoločná pre všetky verzie)
- `version` = monotónne číslo (1, 2, 3…)
- `is_current` = iba jeden riadok `true` per `agent_id`
- `mcp_bindings` = JSONB pole (žiadna separátna junction tabuľka)

**Prečo:**
- Jednoduchšie queries — jeden `SELECT` namiesto JOINu
- MCP bindings sú logicky súčasť agent configu — verzujú sa spolu
- Execution referencuje `agents.id` (konkrétny riadok = immutable snapshot)
- MVP-friendly, menej tabuliek

**Trade-off:**
- `name` a `description` sú na každom riadku — pri rename urobíme `UPDATE agents SET name = $1 WHERE agent_id = $2`
- FK validácia MCP bindings nie je v DB (JSONB) — validuje app layer
- Query "ktoré agenti používajú GitHub MCP?" vyžaduje JSONB query — rare admin query, OK

## Tabuľky

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| password_hash | text | argon2id |
| name | text | |
| email_verified_at | timestamptz null | |
| active | bool | default true |
| deleted_at | timestamptz null | soft delete |

### `orgs`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| slug | text unique | URL-safe identifikátor |
| owner_id | uuid fk users | |
| monthly_cost_limit_usd | numeric(10,2) | default 100 |
| telemetry_consent | bool | default true |

### `org_members`
| Column | Type | Notes |
|---|---|---|
| org_id | uuid fk | PK composite |
| user_id | uuid fk | PK composite |
| role | text | `owner` / `admin` / `member` |

### `agents`

Versioned, immutable rows. Každý edit = nový riadok.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | unikátne per verzia-riadok |
| agent_id | uuid | logická identita agenta (uuid, zdieľaná cez verzie) |
| org_id | uuid fk orgs | |
| created_by | uuid fk users null | SET NULL pri user delete |
| created_by_email | text null | snapshot pre audit po user delete |
| name | text | spoločné cez verzie, UPDATE pri rename |
| description | text | |
| status | text | `draft` / `active` / `archived` |
| version | int | monotónne per agent_id |
| is_current | bool | iba jeden `true` per agent_id |
| system_prompt | text | |
| model_provider | text | `anthropic` (MVP) |
| model_id | text | napr. `claude-sonnet-4-6` |
| params | jsonb | viď štruktúra nižšie |
| mcp_bindings | jsonb | viď štruktúra nižšie |

**Constraints:**
- `UNIQUE (agent_id, version)`
- Partial unique index: `UNIQUE (agent_id) WHERE is_current = true`

**`params` JSONB štruktúra:**
```json
{
  "temperature": 0.2,
  "maxTokens": 4096,
  "maxIterations": 25,
  "maxCostUsd": 5.0,
  "hardTimeoutMs": 600000,
  "parallelToolCalls": true,
  "contextManagement": "auto",
  "compactThreshold": 0.8,
  "toolResultMaxTokens": 8000,
  "dailyCostLimitUsd": 10.0,
  "maxConcurrentExecutions": 5,
  "outputSchema": null,
  "extraRedactPatterns": []
}
```

**`mcp_bindings` JSONB štruktúra:**
```json
[
  {
    "mcpServerId": "uuid-of-github",
    "mcpServerSlug": "github",
    "credentialId": "uuid-of-credential-or-null",
    "allowedTools": ["create_issue", "add_comment"],
    "enabled": true
  },
  {
    "mcpServerId": "uuid-of-filesystem",
    "mcpServerSlug": "filesystem",
    "credentialId": null,
    "allowedTools": null,
    "enabled": true
  }
]
```
`allowedTools: null` = všetky povolené.

**Operácie:**
- **Create agent:** INSERT s `version=1`, `is_current=true`
- **Edit config:** INSERT nový riadok (`version=old+1, is_current=true`), UPDATE starý (`is_current=false`)
- **Rename:** `UPDATE agents SET name = $1 WHERE agent_id = $2` (aktualizuje všetky verzie)
- **Archive:** `UPDATE agents SET status = 'archived' WHERE agent_id = $2`
- **Get current:** `SELECT * FROM agents WHERE agent_id = $1 AND is_current = true`
- **Get history:** `SELECT * FROM agents WHERE agent_id = $1 ORDER BY version`
- **Get for execution:** `SELECT * FROM agents WHERE id = $1` (immutable snapshot)

### `mcp_servers`

Katalóg dostupných MCP serverov. Nie per-agent — globálny.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | `github`, `slack`, `filesystem`, … |
| name | text | human label |
| description | text | |
| transport | text | `stdio` / `http` / `sse` |
| launch_config | jsonb | `{ command, args, env }` alebo `{ url, headers }` |
| auth_type | text | `none` / `static_token` / `oauth2` |
| auth_config | jsonb | pre oauth2: `{ authUrl, tokenUrl, scopes, … }` |
| safety_tier | text | `safe` / `write` / `destructive` |
| requires_isolation | bool | true pre shell, python_exec, filesystem |
| is_builtin | bool | |

### `mcp_credentials`

Per (user/org) × mcp_server. Šifrované.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| mcp_server_id | uuid fk mcp_servers | |
| owner_type | text | `user` / `org` |
| owner_id | uuid | |
| label | text | "Work GitHub", "Personal Gmail" |
| credential_type | text | `static_token` / `oauth2` |
| encrypted_payload | bytea | libsodium encrypted JSON |
| expires_at | timestamptz null | pre refresh kandidátov |

### `triggers`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agent_id | uuid | logický agent (nie verzia) |
| type | text | `http` / `chat` / `cron` |
| name | text | |
| config | jsonb | `{ responseMode, timeoutMs }` / `{ expression, timezone }` / `{}` |
| enabled | bool | |

### `api_keys`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| trigger_id | uuid fk null | |
| org_id | uuid fk null | |
| name | text | |
| hashed_key | text | sha256 |
| prefix | text | prvých 8 znakov |
| last_used_at | timestamptz | |
| revoked_at | timestamptz null | |

### `chat_sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agent_id | uuid | logický agent |
| user_id | uuid fk | |
| title | text | |

### `messages`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid fk chat_sessions | |
| execution_id | uuid fk executions null | |
| role | text | `user` / `assistant` / `system` |
| content | text | |
| created_at | timestamptz | |

### `executions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agent_id | uuid | logický agent |
| agent_snapshot_id | uuid fk agents(id) | immutable verzia = snapshot configu |
| trigger_id | uuid fk triggers null | |
| trigger_type | text | `http` / `chat` / `cron` / `manual` |
| session_id | uuid fk chat_sessions null | |
| status | text | `queued` / `running` / `succeeded` / `failed` / `cancelled` |
| initiated_by | uuid fk users null | |
| input | jsonb | redacted on write |
| output | jsonb null | |
| output_structured | jsonb null | ak `outputSchema` bol nakonfigurovaný |
| error | jsonb null | |
| started_at | timestamptz | |
| ended_at | timestamptz null | |
| last_heartbeat_at | timestamptz null | zombie detection |
| total_prompt_tokens | int | |
| total_completion_tokens | int | |
| total_cost_usd | numeric(12,6) | |

### `execution_events`

**Kompletný audit trail.** Každá akcia agenta = jeden riadok. Toto je **source of truth** pre všetko čo agent robil.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| execution_id | uuid fk executions | |
| seq | int | monotónne per execution |
| timestamp | timestamptz | |
| type | text | viď event types nižšie |
| payload | jsonb | discriminated podľa `type`, redacted on write |

**Event types a čo logujú:**

| Type | Payload | Kedy |
|---|---|---|
| `execution_started` | `{ input, agentConfig }` | Štart behu |
| `llm_request` | `{ model, messageCount, toolCount, promptTokens }` | Pred každým LLM call |
| `llm_chunk` | `{ delta }` | Streaming tokeny (throttled) |
| `llm_response` | `{ text, toolCalls[], usage, finishReason }` | Po každom LLM call |
| `tool_call` | `{ id, name, args }` | Agent volá tool (napr. `github__create_issue({title: "..."})`) |
| `tool_result` | `{ id, result, isError, durationMs }` | Výsledok z MCP servera |
| `compaction` | `{ beforeTokens, afterTokens, summary }` | Context window compaction |
| `tool_result_truncated` | `{ toolCallId, originalSize, truncatedSize }` | Príliš veľký tool result orezaný |
| `log` | `{ level, message, data }` | Runtime log (nie z MCP) |
| `error` | `{ error: SerializedError }` | Akákoľvek chyba |
| `execution_completed` | `{ status, output, budget }` | Koniec behu |

**Príklad: agent pošle email a vytvorí Jira ticket**

| seq | type | payload (skrátené) |
|---|---|---|
| 1 | `execution_started` | `{ input: { webhook: "..." } }` |
| 2 | `llm_request` | `{ model: "sonnet-4-6", tools: 3 }` |
| 3 | `llm_response` | `{ toolCalls: [{ name: "jira__create_issue", args: {...} }] }` |
| 4 | `tool_call` | `{ name: "jira__create_issue", args: { project: "ENG", title: "Bug fix" } }` |
| 5 | `tool_result` | `{ result: { key: "ENG-456" }, durationMs: 890 }` |
| 6 | `llm_request` | `{ model: "sonnet-4-6" }` |
| 7 | `llm_response` | `{ toolCalls: [{ name: "gmail__send_email", args: {...} }] }` |
| 8 | `tool_call` | `{ name: "gmail__send_email", args: { to: "team@acme.com", subject: "..." } }` |
| 9 | `tool_result` | `{ result: { messageId: "abc" }, durationMs: 1120 }` |
| 10 | `llm_request` | `{ model: "sonnet-4-6" }` |
| 11 | `llm_response` | `{ text: "Done. Created ENG-456 and sent email.", finishReason: "stop" }` |
| 12 | `execution_completed` | `{ status: "succeeded", budget: { costUsd: 0.04, tokens: 4200 } }` |

**Index:** `(execution_id, seq)`.

### `agent_files`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agent_id | uuid | logický agent |
| org_id | uuid fk | |
| filename | text | original file name |
| mime_type | text | |
| size_bytes | bigint | |
| storage_key | text | S3 key |
| uploaded_by | uuid fk users | |
| processing_status | text | `pending` / `processing` / `done` / `failed` |
| processed_at | timestamptz null | |

### `file_chunks`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agent_file_id | uuid fk agent_files | |
| agent_id | uuid | denormalized pre rýchly WHERE |
| chunk_index | int | |
| content | text | chunk text |
| embedding | vector(1024) | pgvector |
| token_count | int | |
| metadata | jsonb | `{ page, section, sourceFile }` |

**Index:** HNSW na `embedding` pre approximate nearest neighbor search.

### `daily_agent_costs`
| Column | Type | Notes |
|---|---|---|
| agent_id | uuid | logický agent |
| date | date | |
| total_cost_usd | numeric(12,6) | |
| execution_count | int | |

PK: `(agent_id, date)`. Aktualizuje sa po každej execution (increment).

### `audit_log`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| actor_id | uuid fk users null | |
| actor_email | text null | snapshot |
| org_id | uuid fk null | |
| action | text | |
| entity_type | text | `agent` / `mcp_credential` / … |
| entity_id | uuid | |
| metadata | jsonb | |

## FK cascades

| Parent → Child | On delete |
|---|---|
| `users` → `org_members` | CASCADE |
| `users` → `mcp_credentials` (owner=user) | CASCADE |
| `users` → `agents.created_by` | SET NULL (email snapshot preserved) |
| `users` → `executions.initiated_by` | SET NULL |
| `users` → `audit_log.actor_id` | SET NULL (email snapshot preserved) |
| `orgs` → `org_members`, agents (via agent_id), triggers, api_keys | CASCADE |
| `executions` → `execution_events` | CASCADE |
| `agent_files` → `file_chunks` | CASCADE |

**User deletion:** soft delete default (`deleted_at`). Hard delete (GDPR) = explicit CLI + cascade.

**Agent creator opustí org:** agent žije ďalej, `created_by=NULL`, `created_by_email` preserved, ownership fallback na org owner.

## Indexy

- `agents(agent_id, is_current)` — partial unique WHERE `is_current = true`
- `agents(agent_id, version)` — unique
- `agents(org_id, is_current)` — list current agents per org
- `executions(agent_id, started_at DESC)`
- `execution_events(execution_id, seq)`
- `messages(session_id, created_at)`
- `mcp_credentials(owner_type, owner_id, mcp_server_id)`
- `file_chunks(agent_id)` + HNSW on `embedding`
- `daily_agent_costs(agent_id, date)`
