# 22 — Context Window Management

Dlhobežiaci alebo tool-heavy agenti rýchlo naplnia context window (aj 200k+ tokens). Tento dokument opisuje ako to riešime.

## Prečo je to problém

- Claude Sonnet 4.6: **200k tokens** default, **1M** pri beta allowlist
- MCP tool schemas (GitHub MCP ~8k, Linear ~5k, shell ~2k) — načítajú sa do **každej** LLM request
- Tool results (file contents, API responses) — môžu byť obrie (JSON 50k+ tokens)
- Chat sessions s viacerými ťahmi → exponenciálne rastúca história

Prekročenie context window = hard fail z provider API (429 s `context_length_exceeded`). Preto **nemôžme** si dovoliť pustiť agenta len tak.

## Ako to riešia iní

| Tool | Stratégia |
|---|---|
| **Claude Code** | Auto-compaction — keď context dosiahne threshold, assistant je poverený summarizovať prior turn; summary replaces middle messages |
| **Claude Agent SDK** | To isté auto-compaction built-in, volba `compact` hook |
| **OpenAI Assistants** | Truncation strategy options: `auto` (keep recent N), `last_messages` (hard cap) |
| **LangGraph** | Developer musí state manažovať sám, žiadny auto-mechanizmus |
| **Cursor / aider** | Retrieval-based — starý kód v vector DB, agent sa k nemu priamo dotazuje |
| **Cline / Roo Code** | Kombinácia: summarization + tool result truncation + message pruning |

**Best practice konsenzus:** multi-layer defense.

## Naša stratégia — 4 vrstvy

### Vrstva 1: Auto-compaction (Claude Agent SDK)

Primárny mechanizmus. SDK automaticky keď context dosiahne ~80% max:
1. Pauzne normálny loop
2. Pošle dedicated "compaction prompt" modelu: "Summarize the conversation so far, preserving key decisions, open questions, and relevant context for continuing the task"
3. Nahradí **middle messages** (okrem system promptu a posledných N ťahov) tým summary
4. Pokračuje loop

**Konfigurácia** per agent:
```ts
params: {
  contextManagement: "auto",     // default | auto | manual
  compactThreshold: 0.8,         // fraction of context window triggering compaction
  keepRecentTurns: 5,            // nikdy nekompaktuj posledných N
}
```

**Trade-off:**
- Pro: agent pokračuje bez crashu, zero dev work
- Con: summary je lossy, drobné detaily z minulosti sa stratia
- Con: compaction turn stojí peniaze (napr. sonnet ~$0.10 pre 150k token compaction)
- Con: nedá sa predvídať kedy spadne — pre deterministic cron agenty radšej manuálne boundaries

### Vrstva 2: Tool result truncation

**Problém:** Agent načíta 200k-token JSON z API, zaberie pol context window.

**Rešenie:**
- Runner wrappuje `tool_result` z MCP. Ak `content.length > TOOL_RESULT_MAX_TOKENS` (default 8000):
  - Uloží full result do `execution_events.payload.fullResult` (nie do messages)
  - V messages pošle truncated verziu + footer: `"[... truncated, 145,230 chars. Use tool X or refine query to get less data ...]"`
- Agent v response môže zavolať "retrieve-chunk" tool (ak má) alebo refine queryu

**Konfigurácia:**
```ts
params: {
  toolResultMaxTokens: 8000,       // agent context default
  storeFullResults: true,          // do execution_events pre audit
}
```

**Špeciálne:** niektoré nástroje (file reads) potrebujú chunked access → MCP server má povinnosť exposovať `pagination` alebo `grep-first-then-read` pattern.

### Vrstva 3: Message pruning (manuálne)

Pre prípady, keď compaction-ian-poff nie je deal, alebo chceme tighter control:

**`contextManagement: "manual"`** → agent-core sám robí window:
- Drží **fixed budget** (napr. `contextTokenBudget: 100_000`)
- Pred každou LLM request:
  - `systemPrompt` + `toolSchemas` = immutable
  - Ak `messages` prekročí budget → drop **oldest user/assistant pairs** do max
  - Pred drop-om: ak sú messages označené `important: true` (napr. initial task), skip

**Kedy použiť:** cron agenty s deterministic job scope — nevadí že "zabudnú" middle steps, finálny output je jediné čo sa počíta.

### Vrstva 4: External memory (MCP tool, Phase 6+)

Pre long-lived agentov (persistent memory medzi executions, alebo **veľmi** dlhé single executions):

- Implementujeme `memory` MCP server s Postgres backendom:
  - `memory__write(key, value)` — uloží fakt
  - `memory__search(query)` — sémantické vyhľadávanie (pgvector)
  - `memory__list_keys(prefix)`
- Agent sám rozhodne čo do memory odložiť ("this is the main task's state, I'll pull specifics as needed")
- Context stays small; agent dynamically retrieves

Nie MVP. Phase 6+, kedy bude reálny use case.

## Defaults pre typické agenty

| Agent typ | contextManagement | Why |
|---|---|---|
| Cron digest (Jira example) | `manual` s 50k budget | Deterministic scope, len par turnov, žiadny need na compaction cost |
| Chat s meta-agentom | `auto` | Konverzácia môže ísť ľubovoľne dlho |
| PR reviewer (veľký diff) | `auto` + `toolResultMaxTokens=4000` | Velký tool output, potreba compaction pre iterácie |
| Single-shot HTTP webhook | žiadny (nedosiahne limit) | Malý scope |
| Support triage (long context) | `auto` | Tiketová história môže byť obria |

## Čo robíme v `ExecutionEvent`

Keď dojde k compaction alebo truncation, emitujeme explicit event:

```ts
| { type: "compaction"; beforeTokens: number; afterTokens: number; summary: string }
| { type: "tool_result_truncated"; toolCallId: string; originalSize: number; truncatedSize: number }
```

V UI timeline sa zobrazia ako jemné markery ("🗜 compacted 180k → 12k") — user vie že sa niečo dialo, nie blind magic.

## Monitoring

Metriky ktoré trackujeme:
- `context_usage_peak` per execution (max tokens dosiahnutý)
- `compaction_count` per execution
- `compaction_cost_usd` per execution
- `tool_result_truncations` per execution

Alerting: ak `compaction_count > 3` v jednom execution → pravdepodobne agent design problem (prompt príliš široký, alebo chýba task boundary). Admin notif.

## Anti-patterns

- **"Dáme tam všetko a nech si to Claude vychytá"** — Opus má 200k context ale TTFB ide hore linearne s tokenmi. Nad 50k je user experience žalostný.
- **"Veľký system prompt s long guidelines"** — radšej krátky SP + špecifické tool-použitie inštrukcie inline pri volaní.
- **"Držíme plnú chat history navždy"** — cap session history na N posledných user-assistant párov; staré páry môžu ísť do memory MCP.

## Testovanie context stratégií

V evals (viď `20-llm-evals.md`) máme case-y:
- "long conversation" — 50 turnov, overuje že compaction nestráca kľúčové fakty
- "large tool result" — tool vráti 100k JSON, overuje že agent refine-ne query a dosiahne cieľ
- "budget exceeded" — agent dostane non-stop novú info, musí ju zahrnúť do plánovania, nie len ignore

## Phase plán

| Phase | Čo pridať |
|---|---|
| 1-3 | Žiadne explicit context management — SDK auto-compaction stačí |
| 4 | `toolResultMaxTokens` pre meta-agent (tool listy budú velké) |
| 5 | `manual` mode pre cron agentov s predvídateľným budgetom |
| 6+ | `memory` MCP server |
| 7+ | Monitoring dashboard context usage trendov |
