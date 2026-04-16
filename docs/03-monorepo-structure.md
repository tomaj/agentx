# 03 — Monorepo Structure

```
agentx/
├── apps/
│   ├── api/               # NestJS HTTP API (auth, CRUD, triggers, SSE)
│   ├── web/               # Next.js admin UI
│   ├── runner/            # NestJS headless worker (consumes BullMQ run jobs)
│   └── scheduler/         # Cron scheduler (môže byť súčasťou api)
│
├── packages/
│   ├── db/                # Drizzle schema + migrations + client factory
│   ├── shared/            # Zdieľané TS typy, Zod schémy, konštanty, error triedy
│   ├── agent-core/        # Custom agent orchestration engine (runtime loop)
│   ├── mcp-registry/      # MCP server definitions, auth helpers, OAuth flow handler
│   ├── providers/         # LLM provider adaptéry (wrapper nad Vercel AI SDK)
│   ├── sandbox/            # Folder sandbox + Docker sandbox implementations
│   ├── crypto/            # Encryption helpers pre secrets
│   ├── logger/            # pino setup + OpenTelemetry bridge
│   ├── config/            # env loader + validácia (zod)
│   └── ui/                # Zdieľané React komponenty (shadcn-based) pre web (+ prípadne marketing)
│
├── docs/                  # Dokumentácia (tento folder)
├── docker/                # Dockerfiles, docker-compose.yml
├── scripts/               # Dev scripts (seed, migrate, reset)
│
├── CLAUDE.md
├── README.md
├── package.json           # Root, definuje workspace + dev scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example
```

## Apps

### `apps/api`
- **NestJS** + Fastify adapter
- Moduly: `auth`, `users`, `orgs`, `agents`, `mcp`, `credentials`, `triggers`, `executions`, `chat`, `webhooks`
- SSE endpoint `/executions/:id/events` pre live viewer
- Webhook trigger endpoint `/triggers/:id` (API key auth)
- Používa: `@agentx/db`, `@agentx/shared`, `@agentx/logger`, `@agentx/crypto`

### `apps/web`
- **Next.js 15+** App Router
- `/login`, `/agents`, `/agents/:id`, `/executions/:id`, `/mcp`, `/credentials`, `/chat/:sessionId`
- Server actions kde to dáva zmysel, inak fetch na API
- Používa: `@agentx/ui`, `@agentx/shared`

### `apps/runner`
- NestJS headless (`NestFactory.createApplicationContext`) — žiadny HTTP
- Worker na BullMQ queue `executions`
- Instantiates `AgentExecutor` z `@agentx/agent-core` per job
- Používa: `@agentx/db`, `@agentx/agent-core`, `@agentx/mcp-registry`, `@agentx/providers`, `@agentx/sandbox`, `@agentx/crypto`, `@agentx/logger`

### `apps/scheduler`
- (voliteľne zvlášť; alternatíva: BullMQ Scheduler singleton v API procese s leader election cez Redis lock)
- Pri štarte načíta enabled cron triggery, registruje repeatable jobs

## Packages

### `packages/db`
- Drizzle schema (všetky tabuľky — viď `docs/04-data-model.md`)
- `drizzle.config.ts`, migrácie v `migrations/`
- Exportuje: typed `db` client factory, `schema` objekt

### `packages/shared`
- TS typy pre entity, DTO, enums (`TriggerType`, `ExecutionStatus`…)
- Zod schémy (na validáciu API inputov aj runtime configov)
- Protocol typy pre `ExecutionEvent` (discriminated union)

### `packages/agent-core`
- `AgentExecutor` trieda — spusti run, vráť `AsyncIterable<ExecutionEvent>`
- Loop: prompt build → LLM call (streaming) → parse tool calls → execute tools → feedback → repeat
- Emituje eventy pre každý prompt/response/tool-call/tool-result
- Čistý TS, žiadne DB/HTTP závislosti (prijíma závislosti cez konštruktor — testovateľné)

### `packages/mcp-registry`
- Katalóg známych MCP serverov (`github`, `linear`, `slack`, `gmail`, `filesystem`, `shell`, …)
- Každý má metadata: transport, auth type (`none` / `token` / `oauth2`), default config
- OAuth helper: `startAuthFlow()`, `handleCallback()`, `refreshTokens()`
- Factory: z `McpServer` + `McpCredential` → živá MCP client inštancia

### `packages/providers`
- Tenký wrapper nad Vercel AI SDK
- Podporované: `anthropic`, `openai`, `google`
- Unified `generate({ model, messages, tools, stream })` interface
- Per-provider model registry (ID → token pricing → capabilities)

### `packages/sandbox`
- Interface `Sandbox`: `init()`, `workspacePath`, `runCommand()` (pre shell MCP), `cleanup()`
- `FolderSandbox` (dev) — vytvára `./workspaces/{executionId}/`
- `DockerSandbox` (prod) — spustí container s mounted workspace, resource limits

### `packages/crypto`
- `encrypt(plaintext)` / `decrypt(ciphertext)` používajúc master key z env
- Utility pre hashing API kľúčov (argon2 alebo SHA-256 pre lookup + secret compare)

### `packages/logger`
- pino logger factory + OpenTelemetry SDK bootstrap
- Exportuje `logger.child({ ... })` helper

### `packages/config`
- `loadConfig()` → Zod-validovaný config object
- Strict mode: ak chýba env, crash pri starte (nie runtime)

### `packages/ui`
- Shadcn komponenty nakonfigurované pre Tailwind
- Custom komponenty: `ExecutionTimeline`, `ToolCallCard`, `MessageBubble`, `AgentConfigForm`

## Dependency graph (pravidlá)

- `apps/*` závisí od `packages/*`
- `packages/*` nikdy nezávisí od `apps/*`
- `agent-core` nezávisí od `db` (dependency injection), ale od `shared`
- `web` nezávisí od `db` priamo (všetko cez API)
