# CLAUDE.md

Kontext pre Claude Code pri práci v tomto repozitári.

## O projekte

**agentx** je platforma na tvorbu a exekúciu AI agentov. Používateľ sa prihlási do web UI, nakonfiguruje si agenta (system prompt, model, sada MCP toolov), pripojí credentials pre tools a spustí ho cez HTTP, chat alebo cron.

Zatiaľ sme vo fáze **iba dokumentácia** — žiaden aplikačný kód ešte nie je napísaný. Všetky rozhodnutia sú v `docs/`.

## Quick navigation

- `docs/00-overview.md` — čo platforma robí, kľúčové koncepty
- `docs/01-architecture.md` — diagram a toky dát
- `docs/02-tech-stack.md` — všetky technologické voľby + rationale
- `docs/03-monorepo-structure.md` — layout apps a packages
- `docs/04-data-model.md` — Postgres schéma, entity
- `docs/05-agent-runtime.md` — jadro orchestrátora
- `docs/06-mcp-integration.md` — MCP katalóg, credentials, OAuth
- `docs/07-triggers.md` — HTTP / chat / cron triggery
- `docs/08-sandbox.md` — izolácia per-run
- `docs/09-observability.md` — logy, traces, cost tracking
- `docs/10-auth.md` — user auth, API keys
- `docs/11-meta-agent.md` — agent-builder (agent čo tvorí agentov)
- `ROADMAP.md` — fázovanie od MVP po scale (root level, nie v docs/)
- `docs/13-api-specification.md` — REST endpointy (contract)
- `docs/14-ui-wireframes.md` — ASCII wireframes kľúčových obrazoviek
- `docs/15-ux-guidelines.md` — a11y, shadcn, UI patterns, keyboard shortcuts
- `docs/16-development-workflow.md` — ako rozbehnúť a pracovať lokálne
- `docs/17-environment-config.md` — env vars referencia
- `docs/18-e2e-testing.md` — Playwright stratégia, fake LLM provider, mock MCP
- `docs/19-code-patterns.md` — Controller/Service/Repository, events, policies, errors
- `docs/20-llm-evals.md` — ako testujeme LLM kvalitu (evals framework)
- `docs/21-example-morning-jira-digest.md` — kompletný walkthrough end-to-end agenta
- `docs/22-context-management.md` — ako riešime dlhé executions a veľké tool results
- `docs/23-agent-safety.md` — prompt injection defense, tool safety tiers, autonómia bez HITL
- `docs/24-prompt-caching.md` — Anthropic prompt caching, 90% savings na system prompt
- `docs/25-structured-output.md` — output schema, `__output` virtual tool, validation + retry
- `docs/26-file-handling.md` — upload, S3, processing pipeline (PDF/CSV/images), agent prístup
- `docs/27-cost-governance.md` — per-execution/agent/org budgety, circuit breaker, alerting
- `docs/28-concurrent-execution.md` — maxConcurrency, fair scheduling, cron overlap, backpressure
- `docs/29-rag-knowledge-base.md` — pgvector, file chunks, `knowledge__search` MCP tool
- `docs/30-analytics.md` — materialized views, dashboardy, metriky, CSV export

## Tech stack v skratke

- **Monorepo:** pnpm workspaces + Turborepo, TypeScript end-to-end
- **API:** NestJS
- **Web UI:** Next.js (App Router) + shadcn/ui default (new-york + slate, žiadne custom tweaks) + Tailwind
- **Runner:** NestJS headless worker konzumujúci BullMQ joby
- **DB:** Postgres + Drizzle ORM (domain entita je **execution**, nie run — kvôli kolízii s OpenAI Assistants)
- **Cache / queue broker:** Redis
- **Queue:** BullMQ (aj cron cez repeatable jobs)
- **Agent runtime:** **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) pre Claude modely. Provider abstraction ready pre budúci Vercel AI SDK fallback na OpenAI/Gemini.
- **LLM providers v MVP:** iba Anthropic (Sonnet 4.6 default). Multi-provider-ready v kóde.
- **Sandbox:** **Docker container per execution defaultne** (aj v dev na Mac-u). Folder mode iba pre unit testy bez sensitive MCP.
- **Auth:** Passport + JWT (access + refresh). **MVP bez registration UI** — users cez `pnpm db:seed`.
- **Observability:** pino logy + `execution_events` v Postgres + OpenTelemetry traces. Secret redaction **on write**.

## Konvencie

- Slovenčina v dokumentácii je OK. Kód, commit messages, názvy entít, API routes, UI texty a komentáre (ak sú) sú v angličtine.
- Žiadne premature abstrakcie. MVP najprv, generalizácia keď boliet bude.
- Každý agent run je **auditovateľný** — každý tool call, LLM prompt a response musia ísť do `run_events` tabuľky.
- Secrets (MCP credentials, API kľúče) sa **nikdy** neukladajú plaintextom. Vždy šifrovať cez master key z env.
- **Multi-tenant od Phase 1** — orgs, org_members, role-based policy. Každý resource je scoped na org.
- **UI = shadcn default** (New York varianta, default slate paleta). Žiadne custom farby, radius, typografia, kým nie je dobrý produktový dôvod.
- **Accessibility first** — WCAG AA, keyboard navigation, focus states, aria labels od prvého commitu, nie retrofit.

## Development status

Momentálne: **MVP implementácia** — Step 1-3 hotové (skeleton, API+Runner, Web UI).

## UI pravidlá

- **Nikdy nepoužívať natívny `window.confirm()` / `window.alert()`**. Vždy použiť `<ConfirmDialog>` z `@/components/confirm-dialog` pre potvrdenie deštruktívnych akcií (delete, archive, cancel).
- **Textarea s auto-resize**: Na všetky textarea kde user píše dlhší text (system prompt, descriptions) použiť `<AutoresizeTextarea>` z `@/components/autoresize-textarea`. Žiadne scrollbary vo vstupoch — textarea sa automaticky zväčšuje na výšku podľa obsahu.
- **Entity ID v URL a API**: V `agents` tabuľke rozlišujeme `id` (UUID riadku/verzie) a `agentId` (logická identita). V URL a API routách **vždy používať `agentId`**, nie `id`. Platí pre všetky versioned entity.
- **Agent runtime**: Používame `@anthropic-ai/sdk` (Anthropic SDK) s vlastným agentic loopom, NIE Claude Agent SDK.
- **NestJS DI s tsx**: `tsx` nepodporuje `emitDecoratorMetadata`. Všetky constructor parametre v NestJS providers musia mať explicitný `@Inject(Token)` decorator. Nikdy nespoliehať na implicit type-based injection.

## Pre agentov pracujúcich v tomto repe

1. Pred implementáciou vždy skontroluj príslušný `docs/*.md` — je tam zámer.
2. Ak dokumentácia je v rozpore s požiadavkou, **pýtaj sa** — nemeň jedno ani druhé potichu.
3. Nepíš kód, ktorý nie je pokrytý v docs alebo roadmape, bez potvrdenia od usera.
