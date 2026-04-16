# 01 — Architecture

## High-level diagram

```
                      ┌──────────────────────────────────┐
                      │  Web UI (Next.js)                │
                      │  - Agent editor                  │
                      │  - Chat with agent               │
                      │  - Live execution viewer (SSE)         │
                      │  - MCP catalog + credentials     │
                      └───────────────┬──────────────────┘
                                      │ REST + SSE
                                      ▼
 ┌──────────────┐   enqueue    ┌──────────────────────────┐
 │ HTTP trigger │ ───────────▶ │ API (NestJS)             │
 │ (webhook)    │              │ - Auth, CRUD agentov     │
 └──────────────┘              │ - MCP catalog            │
                               │ - Trigger receivers      │
                               │ - Run orchestration API  │
                               └────────┬─────────────────┘
                                        │
       ┌────────────────────────────────┼────────────────────────────┐
       │                                │                            │
       ▼                                ▼                            ▼
 ┌──────────┐                   ┌───────────────┐            ┌───────────────┐
 │ Postgres │  ◀─── Drizzle ──  │ Redis         │   BullMQ   │ Scheduler     │
 │          │                   │ (cache+queue) │ ◀────────  │ (cron -> jobs)│
 └──────────┘                   └───────┬───────┘            └───────────────┘
                                        │ job:run
                                        ▼
                            ┌─────────────────────────────┐
                            │ Runner (NestJS worker)      │
                            │ ┌─────────────────────────┐ │
                            │ │ Agent orchestrator      │ │
                            │ │  - Vercel AI SDK (LLM)  │ │
                            │ │  - MCP SDK (tools)      │ │
                            │ │  - Event emitter → PG   │ │
                            │ └─────────────────────────┘ │
                            │     spawns per-execution          │
                            │     sandbox (folder/docker) │
                            └─────────────────────────────┘
```

## Komponenty

### Web UI (`apps/web`)
Next.js App Router. Prihlásenie, admin pre agentov, MCP katalóg, chat, live viewer bežiacich runov.

### API (`apps/api`)
NestJS backend. REST endpointy pre CRUD, auth (Passport + JWT), inbound HTTP triggery, SSE streamy z runov. Spravuje queue (enqueue jobs do BullMQ).

### Runner (`apps/runner`)
NestJS worker bez HTTP servera. Konzumuje BullMQ `run` jobs, spúšťa agent orchestration loop, emituje `ExecutionEvent` do Postgres + na Redis pub/sub (aby UI vedela streamovať).

### Scheduler (`apps/scheduler`)
Môže byť aj súčasťou API procesu. Registruje BullMQ repeatable jobs (cron) pre všetky enabled `cron` triggery. Pri spustení jobu enqueuje `run` job pre runner.

### Postgres
Source of truth: users, orgs, agents, mcp servers/credentials, triggers, executions, execution_events, chat sessions, audit.

### Redis
- BullMQ broker
- Cache (session lookup, rate-limit buckets)
- Pub/sub channel `run:{id}:events` → API SSE handler → Web UI live viewer

## Tok: "user spustí agenta cez chat"

1. User v UI píše správu → POST `/agents/:id/chat/:sessionId/message` (API)
2. API uloží `messages`, vytvorí `run` záznam (status=queued), enqueue BullMQ job
3. API otvorí SSE stream, subscribe na Redis `run:{id}:events`
4. Runner pickne job → init sandbox → nahrá MCP servery s credentials ownera agenta → spustí orchestration loop
5. Pre každý LLM call / tool call / tool result runner zapíše `run_event` do PG + publikne do Redis
6. UI zobrazí event v timeline v reálnom čase
7. Po ukončení runner finalizuje `run` (status, tokens, cost), pošle `done` event

## Tok: "HTTP webhook trigger"

1. External systém POST `/triggers/:triggerId` s `X-API-Key`
2. API autorizuje key, validuje payload, enqueue `run` job
3. Runner spustí agent execution (bez UI), response: 202 Accepted + run ID
4. Ak trigger má `responseMode=sync`, API čaká na `run_completed` event (s timeoutom) a vráti výsledok
5. Inak je response async — klient si môže pollovať `/executions/:id` alebo použiť callback URL

## Tok: "cron trigger"

1. Scheduler pri boote načíta všetky enabled cron triggery, registruje ich ako BullMQ repeatable jobs
2. BullMQ v cron-time pošle job do queue
3. Rovnaký flow ako HTTP trigger, len initiator = `system`

## Deployment

### Local dev (Mac)

Cieľ: minimum Dockera, maximum DX.

- **Postgres**: natívne (Homebrew alebo Postgres.app) alebo existujúca inštancia na stroji
- **Redis**: natívne (`brew install redis`)
- **API / Web / Runner / Scheduler**: spustené cez `pnpm dev` (Turbo spustí všetky apps naraz, hot reload)
- **Docker sandbox**: *vypnutý* v dev-e (sandbox mód = `folder`). Docker sa zapne až keď chceme testovať izoláciu.

`.env` odkazuje na `localhost:5432` / `localhost:6379`. Zero-Docker zero-overhead workflow.

### Remote (Hetzner alebo podobný VPS, neskôr)

1× VPS, `docker-compose.yml`:
- `postgres`, `redis`, `api`, `web`, `runner`, `scheduler`
- Reverse proxy (Caddy) s auto-HTTPS
- Sandbox mode: `docker` (beh na rovnakom host-e cez Docker-in-Docker alebo socket mount)

Neskôr: runner sa dá horizontálne škálovať (N inštancií konzumujúcich tú istú queue). Scheduler môže ostať singleton s leader election.
