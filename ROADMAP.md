# Roadmap

Rozdelené na **MVP** (čo najskôr funkčné) a **Post-MVP** fázy.

---

# MVP — Agent s MCP tools, live timeline

Cieľ: Vytvorím agenta, pripojím mu MCP tools (napr. Jira, GitHub), spustím ho, a vidím v reálnom čase ako volá tools, dostáva výsledky a iteruje. Ten Jira morning digest use-case musí fungovať.

## Čo MVP obsahuje

- **Login** (seed user + org, fixné heslo)
- **Agent CRUD** — meno, system prompt, model, MCP bindings
- **MCP katalóg** — seeded servery (filesystem, http-fetch, github, shell), CRUD v UI
- **MCP credentials** — user paste-ne static token, uloží sa zašifrovaný
- **Manual trigger** — kliknem "Run" v UI, zadám JSON input
- **Agent execution loop** — Claude Agent SDK: LLM → tool calls → MCP → results → LLM → ... → done
- **Live execution timeline** — SSE streaming, vidím každý LLM request, tool call, tool result, error, completion
- **Execution history** — zoznam minulých executions per agent
- **Folder sandbox** — jednoduchý workspace folder per execution (stačí na dev)

## Čo MVP NEobsahuje

- Triggery (HTTP webhook, cron) — Phase 2
- Chat sessions (multi-turn conversation UI) — Phase 2
- Agent versioning (agents sú mutable, proste UPDATE) — Phase 3
- Docker sandbox — Phase 3
- File uploads / RAG / pgvector — Phase 3
- Tags, governance, issues, scoring — Phase 4+
- Structured output — Phase 2
- Custom inline tools (code editor) — Phase 3
- Channels (Slack, Email, WhatsApp) — Phase 5
- Skills, alerts, custom metrics — Phase 5+
- Prompt caching, cost governance, concurrent limits — pridáme keď budú reálni useri

## MVP DB (8 tabuliek)

```
users, orgs, org_members
agents (mutable, mcp_bindings JSONB)
mcp_servers (seeded katalóg)
mcp_credentials (encrypted tokens)
executions
execution_events
```

## MVP API (~10 endpointov)

```
POST /auth/login
GET  /auth/me

GET  /agents
POST /agents
PATCH /agents/:id
DELETE /agents/:id

GET  /mcp/servers                    (katalóg)
GET  /mcp/credentials
POST /mcp/credentials               (paste token)
DELETE /mcp/credentials/:id

POST /agents/:id/execute             (manual run)
GET  /executions/:id/events          (SSE stream)
GET  /executions                     (history)
```

## MVP UI (~5 stránok)

```
/login
/agents                              (list + create)
/agents/:id                          (edit: prompt, model, MCP bindings)
/agents/:id/execute                  (run s JSON input → redirect na timeline)
/executions/:id                      (live timeline)
```

## MVP postup

**Step 1 — Skeleton (teraz)**
- Monorepo (pnpm + turbo)
- docker-compose: postgres + redis
- Drizzle schema (8 tabuliek) + migrations + seed
- `.env.example`, tsconfig, biome

**Step 2 — API + Runner**
- NestJS API: auth (login), agents CRUD, MCP catalog/credentials
- Runner: BullMQ consumer, Claude Agent SDK, MCP client loading, event emitter
- Execute endpoint → enqueue → runner picks up → loop → events do PG + Redis pub/sub
- SSE endpoint

**Step 3 — Web UI**
- Next.js: login, agents list, agent editor (s MCP binding UI), execution trigger, live timeline
- shadcn default, minimal

**Step 4 — Polish & test**
- Seed s reálnym use-case (Jira digest agent)
- Fix bugs, UX polish
- Vitest unit testy pre agent-core

**MVP exit kritérium:**
Seed, login, vytvorím "Morning Jira Digest" agenta so system promptom + Jira MCP (static token) + Gmail MCP, spustím ho, vidím v timeline ako volá `jira__list_issues`, dostane výsledky, volá `gmail__send_email`, dokončí. Execution ukazuje cost a trvanie.

---

# Post-MVP Fázy

## Phase 2 — Triggery + chat + structured output

- HTTP trigger + API keys
- Cron trigger + scheduler
- Chat trigger + chat UI (multi-turn, sessions, messages)
- Structured output (outputSchema, `__output` virtual tool)
- Sync/async HTTP response modes

**Exit:** Cron agent beží automaticky, webhook funguje, chat je plynulý.

## Phase 3 — Versioning + sandbox + files + custom tools

- Agent versioning (immutable rows, is_current, draft → publish)
- Docker sandbox (default, folder len pre testy)
- File uploads + RAG (S3/MinIO, pgvector, `knowledge__search` MCP)
- Custom inline tools (Monaco code editor, JS/TS, sandbox execution)
- Global secrets UI (org_secrets)

**Exit:** Agent s uploadnutým PDF odpovie na otázku; Docker izoluje agenta.

## Phase 4 — Meta-agent + evals

- Agent Builder (meta-agent, creates agents via chat)
- Eval framework (code-based + LLM-as-judge)
- Scenario builder UI (vizuálny turn-by-turn editor)
- Agent review flow (draft → diff → eval → publish)
- Conversation flow visualization

**Exit:** Vytvorím agenta cez Builder; evals passujú.

## Phase 5 — Security + quality + governance

- OAuth MCP (GitHub, Slack, Gmail)
- Governance policies (CRUD, runtime enforcement)
- Issues tracker per agent
- Execution scoring (sentiment + quality)
- Tags system (auto-tagging, tag definitions)
- Cost governance (per-agent daily, per-org monthly budgets)
- Concurrent execution limits
- Prompt injection defense (hardened pre webhook exposure)

## Phase 6 — Channels + skills + production hardening

- Channels (Slack, Email, WhatsApp inbound/outbound)
- Agent Skills (reusable sub-components)
- Docker sandbox resource enforcement
- Network proxy, secrets rotation
- Heartbeat zombie detection
- External memory MCP

## Phase 7 — Analytics + observability

- Custom metrics (tag-based rules)
- Alerts (metric-based, severity routing)
- Org + agent dashboards
- Agent Builder production analysis
- OpenTelemetry export
- CSV export, retention policies

## Phase 8+ — Scale + billing

- Invitations, registration UI
- Billing (Stripe)
- Horizontal runner scaling
- Platform admin dashboard
- Marketplace, A/B testing, agent-to-agent calls

---

# Mimo scope (natrvalo)

- Human-in-the-loop approval (agenti sú plne autonómni)
- Voice/telephony
- Training vlastných modelov
- Vlastný MCP protokol fork
