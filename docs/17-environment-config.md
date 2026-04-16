# 17 — Environment Config

Zoznam env variables + rozdelenie podľa apps. Všetky sú validované cez Zod pri štarte (z `@agentx/config`) — missing required var = okamžitý crash s jasnou hláškou.

## `.env.example` (root)

Commit-nutý. Obsahuje všetky keys s placeholder hodnotami + komentáre. `.env.local` (gitignored) = reálne hodnoty.

```dotenv
# ========== Shared ==========
NODE_ENV=development
LOG_LEVEL=debug                    # fatal | error | warn | info | debug | trace

# ========== Database ==========
DATABASE_URL=postgres://tomaj@localhost:5432/agentx_dev
DATABASE_URL_TEST=postgres://tomaj@localhost:5432/agentx_test

# ========== Redis ==========
REDIS_URL=redis://localhost:6379

# ========== Secrets ==========
# 32-byte base64 key pre per-field encryption MCP credentials
# Generate: openssl rand -base64 32
AGENTX_MASTER_KEY=

# JWT
# Generate: openssl rand -base64 48
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# ========== API (apps/api) ==========
API_PORT=4000
API_BASE_URL=http://localhost:4000
CORS_ORIGINS=http://localhost:3000
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false                # true v prod (HTTPS)

# ========== Web (apps/web) ==========
# Public (client-side reachable)
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_APP_NAME=agentx
# Private (server-side only v Next.js)
WEB_INTERNAL_API_URL=http://localhost:4000/api/v1

# ========== LLM providers ==========
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=

# ========== Runner (apps/runner) ==========
SANDBOX_MODE=folder                # folder | docker
SANDBOX_WORKSPACE_ROOT=./workspaces
SANDBOX_KEEP_WORKSPACES=false      # true = ponechaj folder po runi (debug)

# Docker sandbox (when SANDBOX_MODE=docker)
SANDBOX_DOCKER_IMAGE=agentx-sandbox:latest
SANDBOX_DOCKER_MEMORY=2g
SANDBOX_DOCKER_CPUS=1.0
SANDBOX_DOCKER_NETWORK=agentx_sandbox_net

# Agent runtime defaults (user agent config môže override)
RUN_DEFAULT_MAX_COST_USD=5
RUN_DEFAULT_MAX_ITERATIONS=25
RUN_DEFAULT_HARD_TIMEOUT_MS=600000
TOOL_CALL_DEFAULT_TIMEOUT_MS=60000

# ========== Scheduler ==========
SCHEDULER_ENABLED=true

# ========== MCP OAuth (Phase 5) ==========
MCP_OAUTH_BASE_CALLBACK_URL=http://localhost:4000/api/v1/mcp/oauth/callback
# Per-server OAuth apps — iba pre tie, pre ktoré máme registrované OAuth app.
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
SLACK_OAUTH_CLIENT_ID=
SLACK_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
NOTION_OAUTH_CLIENT_ID=
NOTION_OAUTH_CLIENT_SECRET=

# ========== Observability ==========
OTEL_EXPORTER_OTLP_ENDPOINT=        # prázdne = disabled
OTEL_SERVICE_NAME_API=agentx-api
OTEL_SERVICE_NAME_RUNNER=agentx-runner
OTEL_SERVICE_NAME_WEB=agentx-web

# ========== Rate limits ==========
RATE_LIMIT_AUTH_PER_15MIN=5
RATE_LIMIT_API_PER_MIN=60
RATE_LIMIT_WEBHOOK_PER_MIN=60

# ========== Feature flags ==========
FEATURE_META_AGENT_ENABLED=true
FEATURE_DOCKER_SANDBOX_ENABLED=false
```

## Validation (packages/config)

Každá app má vlastnú Zod schému nad env:

```ts
// packages/config/src/schemas.ts
export const sharedEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  LOG_LEVEL: z.enum(["fatal","error","warn","info","debug","trace"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AGENTX_MASTER_KEY: z.string().min(32),
});

export const apiEnv = sharedEnv.extend({
  API_PORT: z.coerce.number().int().default(4000),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // ...
});

export const runnerEnv = sharedEnv.extend({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  SANDBOX_MODE: z.enum(["folder","docker"]).default("folder"),
  // ...
}).refine(
  (e) => e.ANTHROPIC_API_KEY || e.OPENAI_API_KEY || e.GOOGLE_GENERATIVE_AI_API_KEY,
  { message: "At least one LLM provider API key is required" }
);
```

App při starte:
```ts
const env = apiEnv.parse(process.env);   // crash pri invalide
```

## Required vs optional

| Var | Required when | Notes |
|---|---|---|
| `DATABASE_URL` | always | |
| `REDIS_URL` | always | |
| `AGENTX_MASTER_KEY` | always | **Nikdy nemeniť po prvom run-e** (rozšifrovanie starých credentials). Pri rotácii treba migration script. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | api | Rotácia = všetci useri logout, OK |
| `ANTHROPIC_API_KEY` (ap. OpenAI/Google) | runner | Aspoň jeden |
| `SANDBOX_MODE` | runner | `folder` default dev, `docker` prod |
| `*_OAUTH_CLIENT_*` | api (phase 5) | Iba pre MCP servery s OAuth |

## Secret management

### Local dev

- `.env.local` v root (gitignored)
- `.env.example` commit-nutý pre reference

### CI

- GitHub Actions secrets
- Test env používa in-memory / localstack kde sa dá; reálne providery mockujeme

### Production

- **1Password, Doppler, alebo AWS Secrets Manager**
- Environment inject do container-u pri starte (docker compose `env_file` alebo secret mount)
- **Nikdy** nepushuj `.env.*` s reálnymi secrets do gitu

## Rotácia kľúčov

### JWT_SECRET

- Bezpečné kedykoľvek; následok = všetci aktívni useri musia re-login
- Rotate po bezpečnostnom incidente alebo každých 6 mesiacov

### AGENTX_MASTER_KEY

**STRATA TOHOTO KĽÚČA = TRVALÁ STRATA VŠETKÝCH MCP CREDENTIALS.** Žiadna recovery. User by musel manuálne re-connect každý MCP server pre každého svojho usera.

**Backup procedúra (POVINNE po prvom nasadení):**

1. **Generácia**: `openssl rand -base64 32`
2. **Primary storage**: Doppler / 1Password / AWS Secrets Manager — **nikdy** len na disku
3. **Offline backup**: vytlač alebo napíš na 2× sealed envelope (paper backup), ulož do dvoch fyzicky oddelených lokácií (doma + banka, …). Pri SaaS deploy: odovzdaj jednu obálku druhému zakladateľovi / právnikovi
4. **DR test**: raz za 6 mesiacov over že z backupu vieš rekonštruovať kľúč (typing test)
5. **Nikdy** neukladať do Git histórie (vrátane gitignored súborov v stash)

**Rotate:**
1. Pridaj `AGENTX_MASTER_KEY_NEW` (nie override)
2. `@agentx/crypto` podporuje dual-key read (skúsi NEW potom OLD) od verzie X
3. Background job `rotate-credentials`:
   - Pre každý `mcp_credential` row v batches: decrypt OLD → encrypt NEW → UPDATE
   - Idempotentné (rerun-safe) cez `encrypted_with_key_version` column
4. Po successful rotate všetkých credentials: swap env (`NEW` → primárny), nech `OLD` bliži krátky čas pre istotu
5. Phase 5+ — MVP single key + jeden sealed paper backup stačí

**Multi-key support (Phase 6+):** `mcp_credentials.master_key_id` column pre keyring — umožní lazy rotate namiesto big-bang.

### OAuth client secrets

- Rotate cez OAuth provider dashboard, update env, redeploy API
- Existujúce refresh tokens ostávajú valid (provider ich viaže na client ID, nie secret generation)

## Per-environment odlišnosti

| Env | NODE_ENV | LOG_LEVEL | SANDBOX_MODE | COOKIE_SECURE |
|---|---|---|---|---|
| Local dev | development | debug | folder | false |
| CI test | test | error | folder | false |
| Staging (phase 6) | production | info | docker | true |
| Production | production | info | docker | true |

## Debug env issue

Ak app nestartuje a hádže Zod error:
```
Error: AGENTX_MASTER_KEY is required and must be min 32 chars
```
→ skontroluj `.env.local`, skontroluj `dotenv` loading (poradie: `.env.local` > `.env.${NODE_ENV}` > `.env`).

V Nest:
```ts
ConfigModule.forRoot({
  envFilePath: [".env.local", ".env"],
  validate: (e) => apiEnv.parse(e),
});
```

## Čo **nie je** env

- Feature toggles per-org → DB (`orgs.features` JSONB), nie env
- LLM model pricing → in-code registry v `@agentx/providers`
- MCP server katalóg → DB (cez seed), nie env
