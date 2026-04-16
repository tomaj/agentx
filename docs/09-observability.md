# 09 — Observability & Logging

Tri vrstvy:

1. **Execution events** — business-level audit (čo agent robil) v Postgres
2. **App logs** — pino structured logs (HTTP requests, errors, warnings)
3. **OpenTelemetry traces** — distributed tracing cez celý stack (API → queue → runner → LLM → MCP)

## Vrstva 1: Execution events (jadro)

Tabuľka `execution_events` (viď `04-data-model.md`). Každý emit z runtime loopu = jeden riadok.

### Event types

```ts
type ExecutionEvent =
  | { type: "execution_started";  input: unknown }
  | { type: "llm_request";         model: string; messages: Message[]; tools: ToolSpec[]; params: {...} }
  | { type: "llm_chunk";           delta: string }
  | { type: "llm_response";        text: string; toolCalls: ToolCall[]; usage: TokenUsage; finishReason: string }
  | { type: "tool_call";           id: string; name: string; args: unknown }
  | { type: "tool_result";         id: string; result: unknown; isError: boolean; durationMs: number }
  | { type: "compaction";          beforeTokens: number; afterTokens: number; summary: string }
  | { type: "tool_result_truncated"; toolCallId: string; originalSize: number; truncatedSize: number }
  | { type: "log";                 level: string; message: string; data?: unknown }
  | { type: "error";               error: SerializedError }
  | { type: "execution_completed"; status: ExecutionStatus; output?: unknown; budget: Budget };
```

### Uloženie & streaming

Runner pre každý event:
```ts
await db.insert(runEvents).values({ executionId, seq: nextSeq(), type, payload, timestamp });
await redis.publish(`run:${executionId}:events`, JSON.stringify(event));
```

Optimalizácia pre `llm_chunk`: buffruj N chunkov alebo batchuj cez krátky interval (napr. 100 ms) aby sme nezaťažili PG.

### Live viewer v UI

Komponent `ExecutionTimeline`:
- Pri mount: `GET /executions/:id/events` (SSE)
- API server side:
  - `lastSeq = 0`
  - Najprv pošle historické eventy z DB (`SELECT * FROM execution_events WHERE execution_id = $1 AND seq > $2 ORDER BY seq`)
  - Potom subscribe na Redis `run:{id}:events` kanál, forwarduje ďalej
- Klient reconnect: pošle `Last-Event-ID` header → server pokračuje od správneho seq

### Replay

Pretože máme **kompletný** event stream, vieme:
- Zobraziť old run rovnako ako live run
- Export do JSON pre debug
- Neskôr: "re-run from this point" — forknúť run z konkrétneho seq-u

## Vrstva 2: App logs (pino)

Každá app (`api`, `runner`, `web`) inicializuje pino cez `@agentx/logger`:

```ts
import { createLogger } from "@agentx/logger";
const logger = createLogger({ app: "api" });
logger.info({ userId, route }, "request");
```

- Structured JSON output
- Auto-redact citlivých polí (`password`, `token`, `authorization`, `apiKey`)
- Dev: pino-pretty
- Prod: plain JSON → stdout → docker → centralizovaný log aggregator (neskôr, napr. Loki alebo Elastic)

Level konfigurácia:
- Dev: `debug`
- Prod: `info`
- Runner debug runov: per-execution `logger.child({ executionId })` prikladá executionId ku každému logu

## Vrstva 3: OpenTelemetry

`@agentx/logger` bootstrap-uje aj OTel SDK:

```ts
// auto-instrumentation pre http, fastify, pg, bullmq, redis
// manual spans pre LLM calls a tool calls
```

Kľúčové spans:
- `http.request` (auto)
- `pg.query` (auto)
- `bullmq.job.process` (auto)
- `llm.call` — attributes: `llm.vendor`, `llm.model`, `llm.prompt_tokens`, `llm.completion_tokens`, `llm.cost_usd`
- `tool.call` — attributes: `mcp.server`, `tool.name`, `tool.duration_ms`, `tool.error`

Exporter:
- Dev: `otel-desktop-viewer` alebo Jaeger v docker-compose
- Prod: OTel collector → Jaeger/Tempo (voliteľne aj Datadog / Honeycomb)

## Cost & usage dashboard

Queries nad `executions` + `execution_events`:
- Total cost per agent / per user / per day
- Top expensive runs
- Tool call frequency
- Average tokens per execution
- P95 run duration

UI stránky:
- `/executions` — lista všetkých runov s filterom (agent, status, date range)
- `/executions/:id` — detail s timeline
- `/analytics` — dashboard (charts cez recharts alebo tremor)

## Retention

- `execution_events`: 90 dní default, partitioning by month. Staršie archive do S3 (neskôr).
- `executions`: perzistentné (len metadata, malé)
- `audit_log`: perzistentný

## Alerting (neskôr)

- Failed run rate > X% → Slack webhook
- Cost spike → email
- MCP server auth failures → admin notif

## Secret redaction (critical — apply on WRITE, not just on display)

**Pravidlo**: secret redaction musí prebehnúť **pred zápisom** do `execution_events`, `executions.input`, `executions.output`, `audit_log.metadata`, `messages.content`. Nie pri read/render. Dôvod: DB je súčasť útočného povrchu; ak sa niekto dostane k PG, redact-on-read by bol useless.

**Kde aplikujeme:**
- `@agentx/shared/redact.ts` — čisté funkcie `redactSecrets(value: unknown): unknown`
- Volá sa v event emitteri pred `INSERT` do `execution_events`
- Volá sa v trigger controlleri pred uložením `executions.input` (HTTP payloads môžu obsahovať tokeny)
- Volá sa v pino `formatters.log` (automaticky, takže ani app logs neobsahujú secrets)

**Čo redactujeme:**
- **Field names (case-insensitive)**: `password`, `token`, `apiKey`, `api_key`, `authorization`, `secret`, `credential`, `privateKey`, `accessToken`, `refreshToken`, `clientSecret`, `sessionId`
- **Value patterns (regex)**:
  - JWT: `ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
  - OpenAI: `sk-[A-Za-z0-9]{40,}`
  - GitHub: `ghp_[A-Za-z0-9]{36}`, `gho_[A-Za-z0-9]{36}`, `ghs_[A-Za-z0-9]{36}`
  - Slack: `xox[baprs]-[A-Za-z0-9-]+`
  - Anthropic: `sk-ant-[A-Za-z0-9-]{40,}`
  - Google OAuth: `ya29\.[A-Za-z0-9_-]+`
  - AWS: `AKIA[0-9A-Z]{16}`
- **Heuristic**: long high-entropy strings (>40 chars, shannon entropy > 4.0) v suspicious keys → redact with `[REDACTED:HIGH_ENTROPY]`

**Replace format:** `"[REDACTED:pattern_name]"` namiesto masking (`***`) — aby audit vedel **čo** bolo redacted bez expose hodnoty.

**Per-agent custom redactors:** V `agent_versions.params.extraRedactPatterns` môže user pridať vlastné regex — napr. interné invoice ID pattern.

**Čo nevkladáme do logov nikdy** (ani redacted):
- Full `mcp_credentials.encrypted_payload` — nech ostane len v crypto-scoped code path
- Password fields v user auth (aj hashed — blocker pre security audits)

**Test:** `redactSecrets` má unit testy s fixture payloadmi čo obsahujú every known pattern. CI fail ak pattern sa dostane cez.
