# 07 — Triggers

Trigger definuje **ako** sa agent spustí. Typ je jeden z `http`, `chat`, `cron`. Jeden agent môže mať viacero triggerov rôznych typov.

## HTTP trigger

### Setup

V UI user klikne "Add HTTP trigger", vyberie:
- **Response mode**: `sync` (API čaká na run completion a vráti output) alebo `async` (API vráti run ID okamžite)
- **Timeout** pre sync mode (default 60 s, max 10 min)

API vygeneruje endpoint URL + API key.

### Endpoint

```
POST /triggers/:triggerId
Headers:
  X-API-Key: <key>
  Content-Type: application/json
Body:
  { ...ľubovoľný JSON, passed as input to agent... }
```

### Tok

1. API verifikuje API key (`hashed_key` lookup + compare, kontrola `revoked_at`)
2. Rate-limit check (Redis token bucket per API key)
3. Vytvorí `executions` record (status=queued), enqueue BullMQ job
4. Log do `audit_log`

**Sync mode:**
5. API subscribe-ne na Redis `run:{id}:events`
6. Čaká na `run_completed` event alebo timeout
7. Vráti 200 `{ executionId, output, tokens, cost }`
8. Pri timeoute: vráti 504 + executionId (klient môže neskôr pollovať)

**Async mode:**
5. API vráti 202 `{ executionId }` okamžite
6. Klient môže:
   - Pollovať `GET /executions/:id`
   - Otvoriť SSE `GET /executions/:id/events`
   - Nastaviť `callback_url` v trigger configu — po completion API spraví POST s výsledkom

### Error response

Runner failure → run status `failed`, API vráti 200 (sync) s `error` poľom (nie HTTP error, pretože platform beh bol OK, len agent zlyhal — HTTP 5xx si rezervujeme na infra chyby).

## Chat trigger

Vytvorí sa automaticky pri vytvorení agenta (implicitný, nie explicitný record v `triggers`?).

**Rozhodnutie:** áno, zapísať ho ako row v `triggers` s `type=chat` pre uniformitu, aj keď nemá URL/key. Len `enabled` flag (disable = skryj chat v UI).

### Tok

1. User otvorí chat session v UI → `POST /agents/:id/chat/sessions` → nový `chat_sessions` row
2. User pošle správu → `POST /chat/sessions/:id/messages` → uloží do `messages`
3. API vytvorí `executions` (session_id = aktuálna session, trigger_type=chat), enqueue job
4. UI otvorí SSE na `/executions/:id/events` → live timeline
5. Runner beží, emituje eventy, ukončí run, pridá finálnu assistant `messages` (role=assistant, execution_id=X)
6. User vidí complete response, môže pokračovať v konverzácii

### Context management

Pri tvorbe prompt messages pre ďalšie správy v rovnakej session:
- Runner načíta posledných N `messages` (kde N = aby sedelo do context window limitu)
- Neskôr: summarization staršej histórie (compaction — podobné ako robí Claude Code)

## Cron trigger

### Setup

User v UI vyberie:
- **Cron expression** (validované cez `cron-parser`)
- **Timezone**
- **Optional static input payload** (JSON) — čo poslať agentovi pri každom spustení

### Registrácia

Scheduler pri boote:
1. Načíta všetky `triggers` where `type=cron AND enabled=true`
2. Pre každý zavolá `queue.add(name, data, { repeat: { pattern: expression, tz } })`

Pri CREATE/UPDATE/DELETE trigger cron-u: API notifikuje schedulera (Redis pub/sub `triggers:changed`), scheduler re-registruje daný trigger.

### Tok

1. BullMQ vystrelí repeatable job v cron-time
2. Job handler vytvorí `executions` (trigger_type=cron, initiated_by=null), enqueuje sa samostatný `run` job
   - **alternatíva**: repeatable job sám spracuje run priamo — rozhodnime podľa toho, či chceme oddeliť scheduler od runner-a (asi áno — lepšie scaling)
3. Runner exekvuje
4. Po completion: ak cron trigger má `notify_on_failure` nakonfigurované (email / webhook), scheduler notifikuje

### Missed runs

Default: ak bol systém down v cron-time, nerobíme backfill (preskočíme). Konfigurovateľne `backfill=true` → BullMQ rehydruje. MVP: bez backfillu.

## Manual trigger

Pre debug / development: user klikne "Run" v UI s custom JSON input-om. Interne = jednorazový run bez persistovaného triggera (`trigger_id=null`, `trigger_type=manual`).

## Spoločné

### Trigger → Job payload

```ts
type ExecutionJob = {
  executionId: string;            // pre-vytvorené v DB
  agentId: string;
  agentVersionId: string;
  triggerType: "http" | "chat" | "cron" | "manual";
  triggerId: string | null;
  sessionId: string | null;
  initiatedBy: string | null;
  input: unknown;            // body z webhooku / user msg / cron payload
};
```

### Queue priority

- `chat` executions → high priority (user čaká)
- `http sync` → high
- `http async` → normal
- `cron` → low (background)

BullMQ `priority` option + samostatné queues ak treba.

### Runner crash handling (idempotency-first, no auto-retry)

**Problém:** Runner crashne v iterácii 5 s $0.20 spálenými. Čo sa stane?

**Naive default** (BullMQ auto-retry): job sa re-pickne, execution beží **od nuly**, minie ďalších $0.20+. User dostane 2 emaily, 2 Jira tickety, … Toto nechceme.

**Naša semantika — at-most-once s manuálnym retry:**

1. Pri pick-up job-u runner najprv `SELECT ... FOR UPDATE SKIP LOCKED` na `executions` row
2. Ak `status IN ('running')` **už je** nastavený z predchádzajúceho pokusu → **crash recovery path**:
   - Mark `status='failed'`, `error={ reason: 'runner_crash_detected', previousAttempt: true }`
   - Emit `run_completed` event (finálne)
   - **Nepokračovať** v execution; job je dokončený (BullMQ consume-nutý)
3. Ak `status='queued'` → normal start: `UPDATE SET status='running', started_at=now()`, proceed
4. BullMQ `attempts: 1` (žiadny auto-retry). Developer / user robí retry manuálne cez UI ("Retry execution") alebo API `POST /executions/:id/retry` (vytvorí nový execution record, starý ostáva failed).

**Výhody:**
- User má kontrolu nad recovery (cenovo významné pri LLM calls)
- Agenti so side-effects (send email, create issue) nespravia to 2×
- Audit jasne vidno čo sa stalo

**Nevýhody (akceptované):**
- Ephemeral crashy (temp network glitch) vyžadujú manuálny retry — akceptujeme, runner crash je rare event

**Heartbeat pre dlhé runy:** runner každých 10 s updatuje `executions.last_heartbeat_at`. Ak watch-dog proces (scheduler) nájde execution s `status='running'` a `last_heartbeat_at < now - 60s`, mark failed. Chráni pred "zombie" executions kde runner padol bez error handlera.
