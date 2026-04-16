# 24 — Prompt Caching Strategy

Anthropic prompt caching umoznuje dramaticky znizit naklady na opakovane executions rovnakeho agenta. Tento dokument popisuje ako ho vyuzivame.

## Ako funguje Anthropic prompt caching

Anthropic API podporuje oznacenie casti promptu ako "cacheovatelnej". Ak nasledujuci request posle rovnaky prefix, provider pouzije cached verziu.

| Parameter | Hodnota |
|---|---|
| Cache TTL | 5 minut (od posledneho pouzitia) |
| Cena cached tokens | $0.30/M (vs. $3.00/M standard input) |
| Uspora | **90%** na cached tokenoch |
| Min. cacheable prefix | 1024 tokens (Sonnet), 2048 tokens (Opus) |

Cache sa aktivuje pridaním `cache_control: { type: "ephemeral" }` markeru na koniec bloku, ktory chceme cachovať.

## Nas use case

Typicky agent ma:

- **System prompt**: 1.5-3k tokens (instrukcie, persona, pravidla)
- **Tool schemas**: 3-8k tokens (MCP tool definitions — GitHub ~8k, Linear ~5k, shell ~2k)
- **User input**: variabilny (webhook payload, chat sprava)

System prompt a tool schémy su **staticke medzi executions** rovnakeho agenta (menia sa len pri update agent verzie). User input je vzdy iny.

```
┌─────────────────────────────────────────┐
│  System prompt (2k tokens)              │  ← CACHED
│  Tool schemas (5k tokens)               │  ← CACHED
│  cache_control: ephemeral               │
├─────────────────────────────────────────┤
│  User message (variabilne)              │  ← NOT cached
└─────────────────────────────────────────┘
```

## Implementacia s Claude Agent SDK

Claude Agent SDK podporuje `cache_control` markery na system prompt blokoch. Nasa integracia v `claude-runtime.ts`:

```ts
// packages/agent-core/runtime/claude-runtime.ts

function buildSystemPrompt(agent: AgentVersion): SystemPromptBlock[] {
  return [
    {
      type: 'text',
      text: agent.systemPrompt,
    },
    {
      type: 'text',
      text: formatToolSchemas(agent.mcpTools),
      // Mark the end of static prefix as cacheable
      cache_control: { type: 'ephemeral' },
    },
  ];
}
```

SDK automaticky posle cache_control marker v API requeste. Ak nasledujuci execution rovnakeho agenta pride do 5 minut, Anthropic API pouzije cached prefix.

### Poradie blokov je kriticke

Cache funguje na **prefix matching** — cachovatelny obsah musi byt na zaciatku promptu. Preto:

1. System prompt (staticky) — **prvy**
2. Tool schemas (staticke) — **druhy**, s `cache_control` markerom
3. Conversation history / user input — **posledny** (dynamicky, nikdy nie cached)

Ak by sme dali user input pred tool schemas, cache by sa nikdy nepouzil.

## Kalkulacia uspory nakladov

### Typicky agent

| Zlozka | Tokeny | Bez cache | S cache |
|---|---|---|---|
| System prompt | 2,000 | $0.006 | $0.0006 |
| Tool schemas | 5,000 | $0.015 | $0.0015 |
| User input | 500 | $0.0015 | $0.0015 |
| **Spolu input** | 7,500 | **$0.0225** | **$0.0036** |

Uspora na **jeden execution**: $0.019 (~84% z celkoveho input costu).

### Scenar: cron agent, 1x za hodinu

- 24 executions/den
- Prvy execution: full price ($0.0225)
- Dalsich 23: cached ($0.0036 kazdy)
- **Denne**: $0.0225 + 23 * $0.0036 = **$0.105** (vs. $0.54 bez cache = **80% uspora**)
- Cache hit rate zavisi od frekvencie — pri 1x/hod je TTL (5 min) problem, cache miss viac nez hit

### Scenar: webhook agent, burst traffic

- 100 executions za 5 minut (burst)
- Prvy execution: full price
- Dalsich 99: cached (TTL sa refreshuje kazdym hitom)
- **Per burst**: $0.0225 + 99 * $0.0036 = **$0.379** (vs. $2.25 bez cache = **83% uspora**)

Webhook agenti su idealny use case — bursts drzav cache warm.

## Per-agent cache konfiguracia

### Default: zapnute

Prompt caching je **default ON** pre vsetkych agentov. Vo vacsine pripadov nie je dovod ho vypnut.

### Kedy vypnut

Jediny dovod: agent ma **dynamicky system prompt** ktory sa meni pri kazdom execution (napr. injektuje current timestamp, random context). V takom pripade cache nikdy netrafi a pridava zbytocny overhead (cache write cost).

```ts
// agent_versions.params
{
  "promptCaching": {
    "enabled": true,         // default
    // "enabled": false      // len pre dynamic system prompt agentov
  }
}
```

V praxi je dynamicky system prompt raritny — vacsinou sa casova informacia prida do user message, nie do system promptu.

## Monitoring cache hit rate

### Execution events

Kazdy LLM request loguje cache statistiky do `execution_events`:

```ts
// execution_event.payload pre typ 'llm_request'
{
  type: 'llm_request',
  payload: {
    model: 'claude-sonnet-4-20250514',
    inputTokens: 7500,
    cachedInputTokens: 7000,    // ← kolko bolo cached
    outputTokens: 800,
    cacheHitRate: 0.93,         // cachedInputTokens / inputTokens
    cost: 0.0042,
  }
}
```

### Agregatne metriky

V observability dashboarde (vid `09-observability.md`) sledujeme:

- **Cache hit rate per agent** — priemer cez poslednych 24h
- **Cache hit rate per trigger type** — cron vs. webhook vs. chat
- **Celkova uspora** — kolko by stali executions bez cache vs. s cache

### Alerting

Alert sa triggeruje ak:

- Cache hit rate pre agenta s `promptCaching.enabled: true` klesne pod **80%** za poslednu hodinu
- Mozne priciny: system prompt sa menil prilis casto, agent version sa updatoval, model pin sa zmenil

## Interakcia s model pinning

Cache key na strane Anthropic zahrnuje aj model version. Ak sa zmeni model pin agenta (napr. z `claude-sonnet-4-20250514` na novu verziu):

- **Ocakavany cache miss** — novy model = novy cache key
- Cache sa znovu "zahreje" pri prvom execution s novym modelom
- Toto je expected behavior, nie anomalia — alert by mal byt suppressed pri model version zmene

```ts
// Suppress cache alert pri model zmene
if (agent.modelPinChangedAt && isWithinMinutes(agent.modelPinChangedAt, 10)) {
  suppressCacheAlert(agent.id);
}
```

## Chat sessions

Dolezite rozlisenie pre chat trigger:

```
Execution 1 (turn 1):
  [system prompt + tools] ← CACHED
  [user: "Ahoj"]         ← nie cached

Execution 2 (turn 2):
  [system prompt + tools] ← CACHED (rovnaky prefix)
  [user: "Ahoj"]         ← nie cached (historia)
  [assistant: "Cau!"]    ← nie cached (historia)
  [user: "Co je nove?"]  ← nie cached

Execution 3 (turn 3):
  [system prompt + tools] ← CACHED (stale rovnaky prefix)
  [user: "Ahoj"]         ← nie cached (historia rastie)
  [assistant: "Cau!"]
  [user: "Co je nove?"]
  [assistant: "..."]
  [user: "Dakujem"]      ← nie cached
```

Conversation history sa **nikdy necachuje** — meni sa pri kazdom turne. Cachovany je **len system prompt + tool schemas prefix**. Pri chat sessions je cache stale hodnotny, pretoze system prompt + tool schemas tvoria typicky 70-90% prveho turnu.

## Buduci vyvoj

- **Anthropic moze predlzit TTL** alebo pridat persistent cache — sledujeme API changelog
- **Multi-turn caching** — Anthropic experimentuje s cachovanim dlhsich prefixov vratane conversation history; ak sa to stane GA, adaptujeme
- **Cross-agent cache sharing** — ak viaceri agenti maju rovnake tool schemas (rovnake MCP servery), mozu zdielat cache prefix. Zatial to Anthropic nepodporuje na API urovni, ale je to logicky buduci krok
