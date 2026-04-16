# 05 — Agent Runtime

Jadro platformy. Žije v `packages/agent-core`. Spúšťa sa v `apps/runner`.

## Rozhodnutie: Claude Agent SDK ako runtime pre Claude modely

Po zvážení **neideme** stavať vlastný orchestration loop. Používame **oficiálny Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`). Dôvody:

- **Auto-compaction** kontextového okna je built-in (kritické pre dlhé runy — viď `22-context-management.md`)
- **MCP first-class** — SDK podporuje stdio aj HTTP/SSE MCP servery, OAuth token injection
- **Sub-agents**, **hooks**, **permission modes** hotové
- **Streaming + tool use** otestované Anthropicom, rovnaký engine ako Claude Code desktop
- Rovnaká UX "vidíš čo agent robí" ako v Claude Code — presne to chceme

**Trade-off:** SDK je viazaný primárne na Claude modely. Pre non-Claude providers (OpenAI, Gemini) máme abstrakciu nižšie — ale MVP = Anthropic only, ostatné sú ready-when-needed.

## Architektúra

```
packages/agent-core/
├── runtime/
│   ├── executor.ts          # AgentExecutor — top-level wrapper
│   ├── claude-runtime.ts    # Claude Agent SDK integration
│   ├── provider-runtime.ts  # Future: Vercel AI SDK for non-Claude
│   └── event-bridge.ts      # SDK messages → ExecutionEvent
├── mcp/
│   ├── loader.ts            # Load MCP clients from bindings
│   └── credential-injector.ts
└── budget/
    ├── cost-tracker.ts
    └── guards.ts             # maxCost, maxIterations, timeout
```

### Provider abstraction

```ts
interface AgentRuntime {
  execute(ctx: ExecutionContext): AsyncIterable<ExecutionEvent>;
}

class ClaudeAgentRuntime implements AgentRuntime { /* Claude Agent SDK */ }
class VercelProviderRuntime implements AgentRuntime { /* OpenAI/Gemini, Phase 9+ */ }
```

Selector v `AgentExecutor`:
```ts
const runtime = version.modelProvider === "anthropic"
  ? new ClaudeAgentRuntime(sdkClient, mcpClients, budget)
  : new VercelProviderRuntime(vercelClient, mcpClients, budget);
```

## Zodpovednosti AgentExecutor

1. Načítať `agent_version` + `agent_mcp_bindings` + `mcp_credentials`
2. Pripraviť sandbox (Docker default, folder test-only)
3. Dešifrovať credentials → inštancovať MCP clientov
4. Vybrať runtime (Claude vs Vercel)
5. Zavolať runtime, bridge jeho messages na naše `ExecutionEvent`
6. Trackovať budget (cost + iteration + timeout), interrupt pri prekročení
7. Finalizovať `executions` row
8. Cleanup

## Claude Agent SDK integration

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

async function* executeWithClaudeSdk(ctx: ExecutionContext) {
  const { agentVersion, mcpServers, budget, abortSignal } = ctx;

  const iterator = query({
    prompt: buildPrompt(agentVersion, ctx.input),
    options: {
      model: agentVersion.modelId,                // napr. claude-sonnet-4-6
      systemPrompt: agentVersion.systemPrompt,
      mcpServers,                                  // už loaded + credentialed
      permissionMode: "default",                   // tool calls bez user-confirm (auto-accept)
      maxTurns: agentVersion.params.maxIterations,
      // SDK auto-compaction je zapnutá implicitne
      hooks: {
        preToolUse: (tc) => budget.assertBefore(ctx),   // throw ak exceeded
      },
      abortSignal,                                  // wired on cancel
    },
  });

  for await (const msg of iterator) {
    const events = bridgeSdkMessage(msg);           // SDK msg → naše ExecutionEvent[]
    for (const ev of events) yield ev;
    budget.update(msg);                              // aktualizuje po LLM response
  }
}
```

### Bridging SDK messages → ExecutionEvent

SDK produkuje tagged union: `system`, `assistant`, `user` (s tool_result), `result`. Mapping:

| SDK message | Náš ExecutionEvent |
|---|---|
| `system` (init) | `execution_started` |
| `assistant` (text chunk) | `llm_chunk` |
| `assistant` (full turn) | `llm_response` (s `toolCalls`) |
| `assistant.tool_use` | `tool_call` |
| `user.tool_result` | `tool_result` |
| `result` (success/error) | `execution_completed` |
| custom log | `log` |

Emit stále ide do `execution_events` + Redis pub/sub (viď `09-observability.md`).

## Budget & guards

`BudgetTracker` sleduje:
- `promptTokens`, `completionTokens` → `costUsd` (z `providers` registry)
- `iterations` (turny)
- `wallClockMs` od `started_at`

Pred každou iteráciou (cez `preToolUse` hook alebo pred yield):
- `costUsd > maxCostUsd` → throw `BudgetExceededError` → SDK ukončí loop cez abort signal
- `iterations > maxIterations` → throw `IterationLimitError`
- `wallClockMs > hardTimeoutMs` → throw `ExecutionTimeoutError`

Všetky hodia error event + `execution_completed` so `status=failed`.

## Parallel tool calls

Claude vracia v jednej response **viacero `tool_use` blokov**. SDK ich spustí **paralelne** defaultne (`Promise.all`). Toto správanie nechávame:

- Výhoda: rýchlejšie runy, menej LLM turnov
- Nebezpečenstvo: ak sú tool calls závislé (write-then-read), LLM to vie a dá ich do dvoch turnov — nemusíme to riešiť my
- Konfig override: per-agent `params.parallelToolCalls: false` → force sequential (SDK volba)

## Timeouts & limits (default per execution)

| Parameter | Default | Override kde |
|---|---|---|
| Tool call timeout | 60 s | MCP binding config |
| Max iterations | 25 | `agent_versions.params.maxIterations` |
| Max cost USD | 5 | `agent_versions.params.maxCostUsd` |
| Hard wall-clock timeout | 10 min | `agent_versions.params.hardTimeoutMs` |
| Parallel tool calls | true | `params.parallelToolCalls` |

## Model version pinning

**Problém:** `claude-sonnet-4-6` je tag ktorý Anthropic aktualizuje (point-release fixes). Agent môže správať inak po silent update.

**Rešenie:**
- Pri vytváraní `agent_versions` ukladáme **presne ten model ID** čo user zvolil (napr. `claude-sonnet-4-6-20260315` ak je to explicitná verzia, inak `claude-sonnet-4-6` ktorý je alias)
- Raz za mesiac cron job porovná nasadené model aliasy s aktuálnymi snapshots Anthropicu (dostupné cez API `models/list`) — ak sa zmenil, notif admin-ovi "new snapshot available"
- User môže v editore explicit pin na konkrétny snapshot (`claude-sonnet-4-6-20260315`) alebo ostať na alias (accept auto-updates)
- Pri upgrade model ID cez UI: spustí sa eval suite pred kým sa commitne (viď `20-llm-evals.md`)

## Prerušenie (cancel)

User klikne "Stop" v UI:
1. API: `UPDATE executions SET status='cancelled'`
2. API: `PUBLISH cancel:{executionId}` na Redis
3. Runner subscribuje → fire `abortController.abort()`
4. Claude Agent SDK zachytí abort → ukončí loop, zatvorí MCP
5. Runner emit `execution_completed` so `status=cancelled`, `cleanup()`

## Cost tracking pri prerušení

- Cost sa aktualizuje po každej LLM response (SDK ju poskytne cez `usage` field)
- Ak connection dropne mid-stream: SDK re-emituje `result` event s čiastočným usage alebo error — chytáme to a zapíšeme `total_cost_usd` best-effort
- `executions.error` obsahuje `{ partial: true }` flag ak sme cost merali neúplne

## Testovateľnosť

`AgentExecutor` prijíma všetky závislosti cez DI:
- `agentRepo` — načíta version
- `mcpLoader` — real v prod, in-memory mock v testoch
- `runtimeFactory` — returns `ClaudeAgentRuntime` alebo fake
- `sandboxFactory`
- `eventEmitter`
- `budget`
- `clock`

Unit testy: fake runtime vracia scripted sequence `ExecutionEvent`-ov (identické ako E2E fake provider, viď `18-e2e-testing.md`).

## Kedy prejsť na Vercel AI SDK / custom loop

**Ak** sa ukáže že Claude Agent SDK nám niečo neumožní (napr. custom MCP authentizácia, hook ktorý nie je exposed), fallback je:
- Implement `VercelProviderRuntime` s Vercel AI SDK + `@modelcontextprotocol/sdk`
- Vlastný loop s rovnakou budget/event logikou
- MVP: nie, SDK stačí

## LLM rate limits (Anthropic 429)

Anthropic má per-org rate limits (tokens/min + requests/min). Pri prekročení API vracia 429 s `retry-after` header.

**Stratégia:**
- **Claude Agent SDK** robí automatic retry s exponential backoff pre transient errory (500, 503, 429) — default 3 pokusy. Nemusíme toto implementovať.
- Pri vyčerpaní retries: SDK throw error, runner emit `error` event + `execution_completed` failed
- **Queue-level throttling** (Phase 3+): ak máme 50 executions v queue a všetky udrú rate limit naraz, BullMQ má `rateLimit` option na queue (napr. max 30 jobs/min). Nastavíme podľa Anthropic tier.
- **Per-org accounting** (Phase 8): trackujeme tokens-per-minute per org → ak org-level limit dosiahnutý, delay enqueueing + notify user

**Monitoring:** metric `llm_rate_limit_hits_total`, alert ak > threshold za hodinu.

## Telemetry opt-in/out (Phase 7+ scaffold)

Pre SaaS prípad v budúcnosti: per-org flag `telemetry_consent: boolean` v `orgs` tabuľke. Ak `false`:
- Žiadny OTel export mimo self-hosted stack
- Žiadne analytics events do PostHog
- Žiadne LLM response content do external observability (Langfuse atď.)

MVP: self-hosted, flag existuje ale default `true` s explicit banner v settings. Phase 7 dopracujeme.
