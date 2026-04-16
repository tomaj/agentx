# 02 — Tech Stack

| Vrstva | Voľba | Prečo |
|---|---|---|
| Jazyk | **TypeScript** (všade) | Zdieľanie typov/schem medzi FE/BE/runner bez DTO duplikácie |
| Monorepo | **pnpm workspaces + Turborepo** | De-facto štandard pre TS monoreps, rýchly, caching, task graph |
| API | **NestJS** | Štruktúrovaný, moduly, DI, testable, veľa ekosystému, dobre zvláda komplexný backend |
| Web UI | **Next.js (App Router)** | SSR/RSC, streaming, moderný routing |
| UI kit | **shadcn/ui + Tailwind + Radix** | Vlastníctvo komponentov, rýchle prispôsobenie |
| DB | **Postgres** | ACID, JSONB pre flexibilné payload polia, široká podpora |
| ORM | **Drizzle** | TS-first, migrácie v kóde, malý runtime, dobrá typová inferencia |
| Cache | **Redis** | Session, rate-limits, pub/sub pre SSE |
| Queue | **BullMQ** | Redis-based, cron (repeatable jobs), retries, delays, dashboard (bull-board) |
| Agent runtime (Claude) | **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | Oficiálny, auto-compaction, MCP built-in, sub-agents, hooks — rovnaký engine ako Claude Code |
| Agent runtime (future non-Claude) | Vercel AI SDK + `@modelcontextprotocol/sdk` + vlastný loop | Ready-when-needed pre OpenAI/Gemini — MVP iba Anthropic |
| LLM providers | **Anthropic only v MVP**, provider abstraction ready | Menej debug plôch, lepšie tool-use, hlavný engine built around Claude models |
| Sandbox | **Docker container per execution (default)**. Folder mode len pre unit testy | Docker overhead ~200-500 ms na Mac ARM je zanedbateľný pre agent executions; folder mode je bezpečnostná ilúzia pri shell MCP |
| Auth | **Passport + JWT** (access + refresh), argon2 pre heslá | Vlastná kontrola, štandardná knižnica |
| API key auth | Hashed keys v DB, scoped na agent alebo org | Pre HTTP triggery |
| Secrets encryption | libsodium (`sealedbox`) alebo AES-256-GCM s master key z env | Per-field šifrovanie MCP credentials |
| Logging | **pino** (structured JSON) | Rýchle, low overhead |
| LLM/agent observability | Vlastné `execution_events` v Postgres + OpenTelemetry traces | Priama kontrola, bez ďalšej SaaS závislosti |
| Tracing export | OTel collector → Jaeger / Tempo (voliteľne) | Keď bude potreba |
| Validation | **Zod** | Zdieľané schémy medzi FE/BE/runner |
| Testing | **Vitest** (unit), **Playwright** (e2e) | Rýchle, moderné |
| Lint/format | **Biome** alebo ESLint + Prettier | Biome je rýchlejšie, menej configu |
| CI | GitHub Actions | Štandard |
| Container | Docker + docker-compose (MVP) | Stačí pre 1 stroj |

## Prečo **Claude Agent SDK** a nie vlastný loop

Pôvodne plán bol vlastný orchestrátor nad Vercel AI SDK — ale po reality check-u:

- **Auto-compaction** kontextového okna rieši SDK out-of-the-box. Vlastná implementácia = 1-2 týždne práce a stále horšia ako Anthropicova.
- **MCP tool use** je už optimalizované — parallel tool calls, hooks, permission modes.
- **Sub-agents** built-in pre hierarchické delegovanie (Phase 6+).
- Rovnaký engine ako **Claude Code** — to je presne to UX čo chceme replikovať ("vidíš čo agent robí").
- Provider abstrakcia nad tým: ak neskôr chceme OpenAI/Gemini, implementujeme `VercelProviderRuntime` paralelne ku `ClaudeAgentRuntime` (viď `05-agent-runtime.md`).

Trade-off: pri extrémne custom potrebách (napr. vlastný auth pre MCP ktorý SDK neexposuje) by sme museli prejsť na vlastný loop. MVP: nie.

## Prečo **vlastná observability** namiesto Langfuse/Helicone

Už máme Postgres a potrebujeme audit trail per-execution tak či tak. Duplikovať to do externého tool-u = 2 sources of truth. OpenTelemetry spans pre low-level distributed tracing + naše `execution_events` pre business-level audit dáva kompletný obraz. Ak neskôr UI postavená nad tým nebude stačiť, vieme nad `execution_events` napojiť aj Langfuse ako downstream spotrebiteľa.

## Ďalšie možné doplnky (later)

- **Elastic / OpenSearch** — keď logov bude priveľa pre PG full-text search
- **Mastra / LlamaIndex** — ak by sme RAG chceli ako core feature
- **Temporal** — ak by long-running agent workflows potrebovali durable state mimo BullMQ
- **Clickhouse** — ak by sme chceli analytics nad tokens/costs za milióny runov
