# 16 — Development Workflow

Ako rozbehnúť agentx lokálne na macOS a ako s ním pracovať.

## Prerequisites

- **macOS** (primárny dev target), **Node.js 22 LTS** (cez `nvm` alebo `fnm`)
- **pnpm 9+** (`corepack enable` + `corepack prepare pnpm@latest --activate`)
- **PostgreSQL 16+** — buď Postgres.app, alebo `brew install postgresql@16 && brew services start postgresql@16`
- **Redis 7+** — `brew install redis && brew services start redis`
- **Git**
- Docker **voliteľne** (na MVP Mac dev netreba; treba ho až pri testovaní Docker sandboxu v Phase 6)

## First-time setup

```bash
git clone git@github.com:<...>/agentx.git
cd agentx

# env
cp .env.example .env.local
# otvor .env.local a doplň:
#   - ANTHROPIC_API_KEY
#   - (optional) OPENAI_API_KEY
#   - (optional) GOOGLE_GENERATIVE_AI_API_KEY
#   - AGENTX_MASTER_KEY (vygeneruj: openssl rand -base64 32)
#   - JWT_SECRET, JWT_REFRESH_SECRET (openssl rand -base64 48 každý)

# db
createdb agentx_dev
createdb agentx_test   # pre testy

# install
pnpm install

# migrácie + seed
pnpm db:migrate
pnpm db:seed   # vytvorí default admin usera + Agent Builder meta-agenta + MCP katalóg

# dev server (všetky apps naraz)
pnpm dev
```

Po úspešnom starte:
- Web UI: http://localhost:3000
- API: http://localhost:4000/api/v1
- API docs (swagger): http://localhost:4000/api/v1/docs
- Default login: vytvorený cez seed (credentials vypíše do konzoly pri prvom run-e)

## Scripts

Root `package.json`:

| Script | Čo robí |
|---|---|
| `pnpm dev` | Turbo spustí `dev` task vo všetkých apps paralelne |
| `pnpm build` | Turbo build všetkých apps + packages |
| `pnpm lint` | Biome lint + format check |
| `pnpm format` | Biome format (write) |
| `pnpm typecheck` | `tsc --noEmit` naprieč celým monorepo |
| `pnpm test` | Vitest unit + integration testy |
| `pnpm test:e2e` | Playwright e2e (vyžaduje bežiaci `pnpm dev`) |
| `pnpm db:migrate` | Drizzle aplikuje migrácie |
| `pnpm db:generate` | Generuje migráciu z zmeneného schema |
| `pnpm db:reset` | Drop + recreate + migrate + seed (pre lokál) |
| `pnpm db:seed` | Seed (idempotent) |
| `pnpm db:studio` | Drizzle Studio na http://localhost:4983 |

Per-app scripts (napr. `pnpm --filter @agentx/api dev`).

## Turbo

`turbo.json` definuje task graph:
- `build` závisí od `^build` (upstream packages pred downstream apps)
- `dev` perzistentný task, nie cache
- `test` závisí od `build`
- Cache v `.turbo/` (local) + optionally remote (Turborepo Remote Cache)

## Branching & commits

- Default branch: `main`
- Feature branches: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `refactor/<slug>`
- PR required (aj solo projekt — review cez Claude Code / self)
- **Conventional Commits**:
  - `feat(api): add agent duplicate endpoint`
  - `fix(runner): handle MCP stdio EOF correctly`
  - `docs: update MCP integration for OAuth refresh`
  - `refactor(web): extract ExecutionTimeline component`
  - `chore: bump dependencies`
- Squash-merge defaultne

## Pre-commit hooks

`lefthook` (alebo `simple-git-hooks`) spúšťa:
- Biome format + lint na staged súboroch
- `tsc --noEmit` incremental na zmenených packages

Fail → commit blocked. Fix a skús znova.

## Testing philosophy

### Unit (Vitest)

- `packages/agent-core`, `packages/providers`, `packages/mcp-registry`, utility funkcie
- Žiadne DB / network — cez fakes a dependency injection
- Fast feedback (<2s total pre typický run)

### Integration (Vitest + testcontainers alebo real Postgres)

- API endpointy: real Postgres (test DB), real Redis, mocked LLM
- Drizzle + repositories
- Migrations applied before suite

### E2E (Playwright)

- Critical flows: login, create agent, run agent, view timeline
- Bežia oproti running dev stacku
- Mocked externé služby (MSW alebo recorded fixtures pre LLM)
- Beží v CI na PR

### Čo netestovať

- Pure UI komponenty bez logiky (shadcn wrappers)
- Drizzle schema (TS typy ju garantujú)
- Getter/setter boilerplate

## Debugging

### API (NestJS)

```bash
pnpm --filter @agentx/api dev:debug
# attach z VS Code debuggeru (port 9229)
```

### Runner

- Pridaj `DEBUG=agentx:runner:*` env pre verbose logy
- Per-run logger child automaticky pridáva `executionId` — filteruj v logoch

### Web (Next.js)

- DevTools React 19
- Server components logs v termináli, client components v browser console
- `NEXT_PUBLIC_DEBUG=1` pre dev-only hinty

### DB

- `pnpm db:studio` otvorí Drizzle Studio
- Alebo `psql agentx_dev`

## Ako pridať...

### ... novú DB tabuľku

1. Pridaj do `packages/db/schema/*.ts`
2. `pnpm db:generate` → migrácia v `packages/db/migrations/`
3. Skontroluj migráciu, commit
4. `pnpm db:migrate`

### ... nový API endpoint

1. Do relevant NestJS modulu pridaj controller method + DTO + service
2. Zod schéma v `packages/shared` pre body validáciu (cez `@nestjs/zod` alebo vlastný pipe)
3. Update `docs/13-api-specification.md`
4. Write test

### ... nový MCP server do katalógu

1. Pridaj entry do seed scriptu (`scripts/seed-mcp-catalog.ts`)
2. Ak má OAuth: pridaj client ID/secret do env + config
3. Ak stdio: over že command je pre-installed v sandbox image (phase 6)
4. Re-run seed: `pnpm db:seed`

### ... novú UI stránku

1. Route v `apps/web/app/<segment>/page.tsx`
2. Layout ak treba (`layout.tsx`)
3. Server component pre data fetch; client component len tam, kde je interakcia
4. Skontroluj a11y (keyboard flow, aria, focus)
5. Update `docs/14-ui-wireframes.md` ak nový screen

## CI

GitHub Actions, run on PR a push to main:
- Install (cache pnpm store)
- Lint + typecheck
- Unit + integration tests (Postgres + Redis services)
- E2E (Playwright) — len na PR do main
- Build všetkých apps
- (Phase 6+) Docker image build + push pri merge do main

## Deployment

### Mac local

`pnpm dev` — done.

### Remote (Hetzner/VPS, neskôr)

- Docker compose stack (`docker/docker-compose.prod.yml`)
- CI build images → push GHCR → server pull + restart
- Zero-downtime nie scope MVP; počas deploy drop ~5s requestov OK

## Troubleshooting

**"Error: connect ECONNREFUSED 127.0.0.1:5432"** → Postgres nebeží. `brew services start postgresql@16`.

**"missing env AGENTX_MASTER_KEY"** → negenerated env, `openssl rand -base64 32` a pridaj do `.env.local`.

**Agent execution visí** → skontroluj `executions` status v DB. Runner beží? Redis beží? Skontroluj BullMQ dashboard (Phase 1 pridáme `/admin/queues`).

**Turbo cache weird** → `pnpm turbo run build --force` alebo `rm -rf .turbo`.

## User-facing setup (po nasadení na prod, phase 7+)

Sprievodca first-run:
1. Register first user → auto create "Personal" org, user je owner
2. Onboarding checklist: "Create your first agent" / "Connect an MCP server"
3. Optional: "Try Agent Builder"
