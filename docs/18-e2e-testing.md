# 18 — E2E Testing Strategy (Playwright)

Ako testujeme kompletné user flows end-to-end — od kliknutia v UI cez API, runner, DB až po SSE update v UI.

## Stack

- **Playwright** — browser automation + assertions
- **Test DB**: `agentx_test` (separate Postgres database)
- **Test Redis**: rovnaký server, iná DB number (`redis://localhost:6379/1`)
- **Fake LLM provider** — deterministické odpovede
- **In-memory MCP mock server** — simuluje MCP tooly bez reálnych integrácií

## Čo testujeme E2E

Critical flows, nie každý detail (unit a integration testy pokrývajú detail):
- Login → agents list → create agent → run agent → vidím timeline s tool calls
- Chat session — pošlem správu, vidím live streamed response, pokračujem v conversation
- HTTP trigger — vytvorím trigger + API key → zavolám webhook → run sa spustí → vidím výsledok
- Cron trigger — setup, fast-forward time (mock clock alebo manual trigger), run fires
- MCP binding — pripojím credentials → binding → run používa tool → vidím tool call v timeline
- Error path — agent fails → status `failed` v UI → error detail readable

Čo **netestujeme** E2E:
- Real LLM odpovede (netestujem providera, testujem _náš_ produkt)
- Real external MCP (GitHub, Slack) — testuje sa integráciou oddelene
- Detailné edge cases validácie (unit testy)

## Ako beží lokálne

```bash
# v druhom terminály
pnpm dev:test        # spustí apps s NODE_ENV=test, test DB, test Redis, fake providers

# v prvom terminály
pnpm test:e2e        # Playwright
pnpm test:e2e --ui   # Playwright UI mode pre debug
```

Alebo v jednom:
```bash
pnpm test:e2e:stack  # skript ktorý nabootuje stack + spustí testy + zbalí stack po teste
```

## Test DB setup

`packages/db` exposuje:
```bash
pnpm db:reset --target=test    # drop + create + migrate + seed baseline
pnpm db:seed --target=test --fixture=<name>   # load konkrétny fixture pre test
```

Baseline seed pre E2E obsahuje:
- 1 org "Acme Inc"
- 2 useri: `owner@test.local` (role owner), `member@test.local` (role member) — známe heslá (iba test env)
- 1 meta-agent seeded
- 3 MCP servery v katalógu: `filesystem`, `mock-github`, `mock-slack`
- 0 agentov vytvorených userom (tests ich vytvárajú)

Konkrétne testy si pridajú extra fixtures ad-hoc (napr. pre test "duplicate agent" si seednu 1 agenta).

## Test izolácia

Dve možnosti:
1. **Reset DB medzi testami** — najčistejšie, ale pomalé (~2s per test)
2. **Transactional tests** — každý test beží v transakcii, rollback na konci — ale Playwright nevie rollovať HTTP requesty cez viaceré procesy. Komplikované.

**Rozhodnutie:** reset DB pred každým test **suite** (Playwright `test.describe` = suite), **nie** pred každým test-om. Medzi testami v suite len soft-cleanup (delete agents vytvorené konkrétnym testom).

Pre úplnú izoláciu kritických testov: `test.describe.configure({ mode: "serial" })` + full reset.

## Auth state reuse

```ts
// e2e/global-setup.ts
await page.goto("/login");
await page.fill('[name=email]', 'owner@test.local');
await page.fill('[name=password]', 'test-password');
await page.click('button[type=submit]');
await page.waitForURL('/agents');
await page.context().storageState({ path: 'e2e/.auth/owner.json' });
// ... to isté pre member
```

```ts
// playwright.config.ts
use: {
  storageState: 'e2e/.auth/owner.json',
}
```

Testy ktoré testujú login samotný override cez `test.use({ storageState: { cookies: [], origins: [] } })`.

## Fake LLM provider

Žije v `packages/providers/src/fake.ts`. Aktivovaný cez `LLM_PROVIDER_FAKE_ENABLED=true` + `LLM_PROVIDER_FAKE_SCENARIO=<path>`.

Scenario = JSON soubor:
```json
{
  "name": "pr-reviewer-happy-path",
  "responses": [
    {
      "match": { "lastMessage.role": "user" },
      "response": {
        "text": "I'll review the PR.",
        "toolCalls": [
          { "name": "mock-github__get_pr", "args": { "number": 123 } }
        ],
        "usage": { "promptTokens": 150, "completionTokens": 25 }
      }
    },
    {
      "match": { "lastMessage.role": "tool", "lastMessage.name": "mock-github__get_pr" },
      "response": {
        "text": "Found 2 style issues. Posting comment.",
        "toolCalls": [
          { "name": "mock-github__add_comment", "args": { "prNumber": 123, "body": "..." } }
        ],
        "usage": { "promptTokens": 200, "completionTokens": 45 }
      }
    },
    {
      "match": { "lastMessage.role": "tool", "lastMessage.name": "mock-github__add_comment" },
      "response": {
        "text": "Comment posted.",
        "finishReason": "stop",
        "usage": { "promptTokens": 210, "completionTokens": 15 }
      }
    }
  ]
}
```

Provider:
- Matchuje posledné správy/tool výsledky k jednotlivým `responses`
- Streamuje response po chunks (simuluje real streaming behavior)
- Ak žiadny match → hodí test error "Unscripted LLM call" (chytí nedeklarované volania)

Scenariá žijú v `e2e/scenarios/`. Test si v beforeAll urobí:
```ts
await setScenario("pr-reviewer-happy-path");
```
→ POST na test-only endpoint `/internal/test/llm-scenario` ktorý runner načíta.

## Mock MCP server

In-memory MCP server, štartne sa ako súčasť runnera v test móde. Konfigurovaný podobne scenárami:

```json
{
  "tools": {
    "mock-github__get_pr": {
      "inputSchema": { "type": "object", "properties": { "number": { "type": "number" } } },
      "response": { "title": "Fix auth bug", "changedFiles": 4 }
    },
    "mock-github__add_comment": {
      "inputSchema": { "type": "object", "properties": { "prNumber": {...}, "body": {...} } },
      "response": { "commentId": 999 }
    }
  }
}
```

Alebo hocaký MCP tool môže byť scripted aby vrátil konkrétny result (deterministic).

## Časovanie a SSE

Niektoré testy čakajú na async flows (run completion). Playwright:
```ts
await expect(page.getByText('Run completed')).toBeVisible({ timeout: 30_000 });
await expect(page.getByText('mock-github__get_pr')).toBeVisible();
```

Pre rýchlejšie testy: `LLM_PROVIDER_FAKE_STREAM_DELAY=0` (žiadne umelé delays v fake streame). Produkčný default 50ms per chunk pre realistickú simuláciu.

## Cron testing

Nevieme čakať reálny cron čas. Dva prístupy:
1. **Force-trigger API endpoint** (test-only): `POST /internal/test/triggers/:id/fire` — enqueue sa rovnaký job ako keby cron vystrelil
2. **Clock mock** — BullMQ testovanie cez `setSystemTime` — komplikovanejšie

**Rozhodnutie:** force-trigger endpoint. Rýchle, deterministické.

## Data cleanup medzi testami

Po každom teste (afterEach) volá test-only endpoint:
```
POST /internal/test/cleanup
Body: { createdBy: "owner@test.local", since: "<timestamp>" }
```
→ delete-ne agents, runs, credentials, triggers, sessions vytvorené týmto userom od `since`.

Test DB fixtures (baseline user, meta-agent, MCP catalog) sa **nečistia** — ostávajú medzi testami.

## Playwright config

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'e2e/.auth/owner.json',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // firefox/webkit: Phase 2, chromium stačí pre MVP
  ],
  webServer: process.env.CI ? [
    { command: 'pnpm start:test:api', port: 4000 },
    { command: 'pnpm start:test:web', port: 3000 },
    { command: 'pnpm start:test:runner', url: 'http://localhost:4100/health' },
  ] : undefined,  // lokál expectuje bežiaci `pnpm dev:test`
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html']],
});
```

## CI flow

GitHub Actions job `e2e`:

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_PASSWORD: test, POSTGRES_DB: agentx_test }
    ports: ['5432:5432']
  redis:
    image: redis:7
    ports: ['6379:6379']

steps:
  - checkout
  - setup-node + pnpm
  - pnpm install
  - pnpm build              # packages + apps
  - pnpm db:migrate:test
  - pnpm db:seed:test
  - pnpm exec playwright install --with-deps chromium
  - pnpm test:e2e
  - upload-artifact: playwright-report/
```

## Debug

- **Trace viewer**: `pnpm exec playwright show-trace trace.zip`
- **UI mode**: `pnpm test:e2e --ui` — interactive debug, timeline, network, console
- **Headful**: `pnpm test:e2e --headed`
- **Single test**: `pnpm test:e2e e2e/agents.spec.ts -g "create agent"`
- **Debug API response**: zapni `DEBUG=agentx:*` pre backend, logy idú do `e2e-logs/`

## Limits & anti-patterns

- **Nečakaj fixed timeouts** (`await page.waitForTimeout(2000)`) — vždy `waitFor` na konkrétny element/text
- **Testy nesmú volať real LLM** — `CI=true` kontroluje že fake provider je aktívny, inak fail
- **Testy nesmú volať real external APIs** (GitHub, Slack) — mock MCP handles it
- **Žiadny `Math.random()` / nondeterministic fixtures** — seed-random ak treba
- **Data vytvorené v teste sú vyčistené pred nasledujúcim** — inak flaky

## Nice to have (Phase 7+)

- Visual regression (Percy alebo @playwright/test screenshot compare)
- Accessibility audit (`@axe-core/playwright`) na každej stránke
- Performance assertions (LCP, CLS) cez Playwright + web-vitals
- Cross-browser (Firefox + WebKit)
- Mobile viewports

## Real-LLM smoke tests (separate suite)

`tests/smoke/` — **nie** v normal PR CI. Beží nočne alebo on-demand:
- Real Anthropic key
- 2-3 jednoduché runy ktoré overia, že agent-core + provider SDK funguje s reálnym modelom
- Vlastný timeout, vlastné fail handling
- Alert na Slack ak smoke fail
