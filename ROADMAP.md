# Roadmap

Fázy sú incremental. Každá fáza je nasaditeľná.

## Phase 0 — Foundation (aktuálne)

- [x] Dokumentácia (docs/)
- [x] CLAUDE.md
- [ ] Monorepo skeleton (pnpm workspaces, turbo.json, tsconfig.base, .env.example)
- [ ] `docker-compose.yml` s postgres + redis + minio (S3 storage)
- [ ] Drizzle schema (packages/db) + migrations + pgvector extension
- [ ] Základné `@agentx/shared` typy a Zod schémy
- [ ] Docker sandbox base image build (`docker/sandbox.Dockerfile`)

**Exit kritérium:** `pnpm install && pnpm db:migrate` funguje, `docker compose up` spustí PG + Redis + MinIO.

## Phase 1 — MVP (orgs, seed users, Anthropic only)

Cieľ: Prihlásiť sa, vytvoriť agenta, spustiť ho, vidieť timeline.

- [ ] API skeleton (NestJS): **login** (nie register), users, orgs + org_members, agents CRUD
- [ ] Web UI: login, org switcher, agents list, agent editor, execution history
- [ ] Runner: BullMQ consumer, Claude Agent SDK integration, Docker sandbox per execution
- [ ] `@agentx/agent-core` v1: ClaudeAgentRuntime + event bridge → `execution_events`
- [ ] **Prompt caching** on by default (system prompt + tool schemas cached)
- [ ] **Prompt injection defense**: system prompt hardening, input XML-tagging (viď `docs/23-agent-safety.md`)
- [ ] **Cost governance**: per-execution `maxCostUsd`, per-agent `dailyCostLimitUsd` (viď `docs/27-cost-governance.md`)
- [ ] **Concurrent execution limits**: per-agent `maxConcurrentExecutions` (viď `docs/28-concurrent-execution.md`)
- [ ] Manual trigger (run from UI with JSON input)
- [ ] Live execution viewer (SSE)
- [ ] Policy layer (org-scoped, role check)
- [ ] `pnpm db:seed` — default user + org + meta-agent + MCP katalóg
- [ ] Basic execution list + cost display (viď `docs/30-analytics.md` Phase 1)

**Exit kritérium:** Seed, login, create agent, run, see timeline with cost.

## Phase 2 — MCP tools + file uploads + RAG

Cieľ: Agent používa externé tools a vie pracovať s uploadnutými dokumentmi.

- [ ] `@agentx/mcp-registry` + seed builtin servers (filesystem, shell, github, http-fetch)
- [ ] MCP client loading v runtime, tool call events v timeline
- [ ] `mcp_servers` + `mcp_credentials` CRUD v UI (static token flow)
- [ ] Agent MCP bindings v editore
- [ ] **Tool safety tiers** (safe/write/destructive) per-tool classification (viď `docs/23-agent-safety.md`)
- [ ] **File upload pipeline**: S3 (MinIO) storage, `agent_files` table, processing jobs (PDF/CSV/images/DOCX) (viď `docs/26-file-handling.md`)
- [ ] **pgvector embeddings**: `file_chunks` table, embedding generation, HNSW index (viď `docs/29-rag-knowledge-base.md`)
- [ ] **`knowledge__search` MCP tool**: semantic search over agent's files
- [ ] File management UI (upload, list, delete, processing status)

**Exit kritérium:** Agent s `github` MCP vytvorí issue; agent s uploadnutým PDF odpovie na otázku z neho.

## Phase 3 — Triggery + structured output

Cieľ: HTTP, chat, cron spúšťanie + typované odpovede.

- [ ] HTTP trigger + API keys
- [ ] Chat trigger + chat UI s live viewer
- [ ] Cron trigger + scheduler
- [ ] Sync / async HTTP response modes
- [ ] **Structured output**: per-agent `outputSchema`, `__output` virtual tool, validation + retry (viď `docs/25-structured-output.md`)
- [ ] **Cron overlap protection** (skip ak predchádzajúci execution beží)
- [ ] **Webhook burst protection** (per-agent enqueue rate limit)
- [ ] **Circuit breaker** (3 consecutive expensive failures → auto-disable agent)

**Exit kritérium:** Cron agent beží, webhook vracia structured JSON, chat funguje.

## Phase 4 — Meta-agent + evals

Cieľ: Agent Builder + eval framework.

- [ ] Internal tools API v `agent-core` (`list_mcp_servers`, `create_agent`, `create_trigger`)
- [ ] Seed Agent Builder (pinned model snapshot) pri boote
- [ ] UI: "Talk to Agent Builder" flow
- [ ] **Eval framework** (`evals/`) — code-based + LLM-as-judge grading (viď `docs/20-llm-evals.md`)
- [ ] Meta-agent eval suite (vague prompt, clear prompt, tool selection)
- [ ] Nightly eval CI job

**Exit kritérium:** Vytvorím agenta cez Agent Builder; eval suite passuje.

## Phase 5 — OAuth MCP + security hardening

- [ ] OAuth2 flow (start + callback + token storage)
- [ ] Token refresh job + advisory lock (race condition protection)
- [ ] Encryption at rest (libsodium + master key) — migrate existing static tokens
- [ ] **Output filtering** (PII detection, content moderation pre sync webhook responses)
- [ ] CSRF, rate limiting, audit log dotiahnutý
- [ ] **Hybrid RAG search** (vector + full-text s RRF) (viď `docs/29-rag-knowledge-base.md`)
- [ ] Per-org monthly cost budget + alerting (50%, 80%, 100%)

**Exit kritérium:** GitHub OAuth connected, agent auto-refreshne token, PII filtered z output.

## Phase 6 — Production hardening

- [ ] Docker sandbox resource enforcement (memory, CPU, PIDs)
- [ ] Network proxy s domain allowlist
- [ ] Secrets rotation (dual-key support)
- [ ] Graceful runner shutdown + heartbeat zombie detection
- [ ] **Agent anomaly monitoring** (unusual tool call patterns → alert)
- [ ] **External memory MCP** (persistent key-value per agent cez pgvector)
- [ ] Runner crash recovery finalizácia (at-most-once + manual retry)

**Exit kritérium:** Agent v isolated containeri, zombie detection, anomaly alerts.

## Phase 7 — Analytics + observability

- [ ] **Org dashboard** (cost, executions, top agents, failures) (viď `docs/30-analytics.md`)
- [ ] **Agent detail analytics** (success rate, duration, cost trend, tool distribution)
- [ ] Materialized views + refresh pipeline
- [ ] OpenTelemetry exporter do Jaeger / Tempo
- [ ] **Configurable alert rules** per org
- [ ] Log retention policy + S3 archive
- [ ] CSV export
- [ ] Context usage monitoring (compaction count, peak tokens)

## Phase 8 — Invitations & billing scaffold

- [ ] Email pozvánky do orgu + accept flow
- [ ] Registration UI
- [ ] Sharing rules pre agentov v orgu (per-role)
- [ ] Billing scaffolding (usage tracking per org → Stripe integration začne)
- [ ] **Platform admin dashboard** (cross-org, revenue, system health)
- [ ] Telemetry opt-in/out enforcement

## Phase 9 — Scale

- [ ] Horizontal runner (N inštancií, fair queue consumption)
- [ ] Leader election pre scheduler
- [ ] Read replicas PG
- [ ] (maybe) K8s deployment
- [ ] Dedicated vector DB migration ak >10M chunks (Qdrant/Pinecone)

## Phase 10+ — Nice-to-have

- Marketplace / template agentov
- Agent memory (persistent state medzi executions)
- Agent-to-agent calls (agent spustí druhého ako tool)
- Agent debugging / fork-from-event replay
- Multimodal output (generated images, audio)
- Mobile companion app
- Streaming responses do webhookov
- End-user documentation portal

## Mimo scope (natrvalo)

- Cluster vlastnej GPU infra
- Training vlastných modelov
- Vlastný MCP protokol fork
- Human-in-the-loop approval (design decision: agenti sú plne autonómni)
