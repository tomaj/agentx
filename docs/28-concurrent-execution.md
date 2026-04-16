# 28 — Concurrent Execution Policies

Platforma má ambíciu škálovať na 1000+ agentov. Webhook bursty, cron overlap a runaway agenti môžu rýchlo zahltiť systém. Táto kapitola definuje mechanizmy pre fair scheduling, resource protection a backpressure.

## Per-agent concurrency limit

Každý agent má nastaviteľný maximálny počet súbežne bežiacich exekúcií:

```sql
ALTER TABLE agents ADD COLUMN max_concurrent_executions int DEFAULT 5;
```

Default je 5. Pre jednoduchých webhook agentov stačí 1-2, pre paralelné workloady sa dá zvýšiť.

## Implementácia — Redis sorted set

Aktívne exekúcie sa trackujú v Redis sorted set:

```
Key:    agent:{agentId}:active
Member: executionId
Score:  timestamp (enqueue time)
```

### Pred enqueue

```typescript
async function checkConcurrency(agentId: string, executionId: string): Promise<boolean> {
  const key = `agent:${agentId}:active`;
  const activeCount = await redis.scard(key);

  if (activeCount >= agent.maxConcurrentExecutions) {
    return false; // reject or queue with delay
  }

  // Atomicky pridaj do setu
  await redis.sadd(key, executionId);
  return true;
}
```

### Po dokončení exekúcie

```typescript
async function releaseSlot(agentId: string, executionId: string): Promise<void> {
  await redis.srem(`agent:${agentId}:active`, executionId);
}
```

### Cleanup stale entries

Ak runner crashne a nezavolá `releaseSlot`, zostanú stale záznamy. Riešenie:

- Sorted set používa timestamp ako score
- Cron job `concurrency:cleanup` každých 5 min: `ZRANGEBYSCORE` pre entries staršie ako max execution timeout (30 min) a odstráni ich
- Alternatíva: Redis key expiry cez TTL na helper key per execution

## Queue fairness

BullMQ podporuje rate limiting per queue. Pre fair scheduling medzi agentmi:

### Stratégia: per-agent rate limit

```typescript
const queue = new Queue('executions', {
  connection: redis,
  defaultJobOptions: {
    // Group by agentId pre fair round-robin processing
    group: {
      id: agentId,
      maxSize: agent.maxConcurrentExecutions,
    },
  },
});
```

Toto zabezpečí, že jeden agent s 500 webhookmi za minútu nevyhladuje ostatných agentov. BullMQ worker spracováva joby round-robin medzi skupinami.

## Runner capacity

Jeden runner proces má limit na súbežne spracovávané exekúcie:

```typescript
const worker = new Worker('executions', processExecution, {
  connection: redis,
  concurrency: 10, // max 10 concurrent executions per runner
});
```

| Parameter | Default | Env var |
|---|---|---|
| Concurrency per runner | 10 | `RUNNER_CONCURRENCY` |
| Max execution timeout | 30 min | `EXECUTION_TIMEOUT_MS` |
| Memory limit per execution | 512 MB | Docker `--memory` flag |

Ak sú všetky sloty obsadené, joby čakajú v BullMQ queue. Nový job sa spustí akonáhle sa uvoľní slot.

## Cron overlap protection

Problém: agent má cron trigger `*/5 * * * *` (každých 5 min), ale exekúcia trvá 8 min. Bez ochrany sa budú hromadiť.

### Riešenie: skip ak predošlá ešte beží

```typescript
async function handleCronTrigger(agent: Agent, trigger: Trigger): Promise<void> {
  const activeCount = await redis.scard(`agent:${agent.id}:active`);

  // Špecificky pre cron: check či existuje aktívna exekúcia z tohto triggeru
  const activeCronExec = await redis.get(`cron:${trigger.id}:running`);
  if (activeCronExec) {
    await auditLog.create({
      agentId: agent.id,
      triggerId: trigger.id,
      event: 'skipped_overlap',
      details: { reason: 'Previous cron execution still running', activeExecutionId: activeCronExec },
    });
    return; // skip, nequeuuj druhú exekúciu
  }

  // Označ že cron beží
  const execution = await enqueueExecution(agent, trigger);
  await redis.set(`cron:${trigger.id}:running`, execution.id, 'EX', 3600);
}
```

Po dokončení exekúcie:

```typescript
await redis.del(`cron:${trigger.id}:running`);
```

Skipped overlap sa loguje do `audit_log` a je viditeľný v UI v execution history.

## Webhook burst protection

Webhooky môžu prísť v burstoch (napr. batch update v externom systéme). Ochrana na dvoch úrovniach:

### 1. Per-API-key rate limit (už existuje v auth)

Globálny rate limit na API kľúč — viď doc 10 (auth). Default: 60 req/min.

### 2. Per-agent enqueue rate limit

Nad rámec API rate limitu, špecifický limit na enqueue pre jedného agenta:

```typescript
const AGENT_ENQUEUE_RATE_LIMIT = 10; // max 10 enqueues per minute
const AGENT_ENQUEUE_WINDOW = 60;     // seconds

async function checkEnqueueRateLimit(agentId: string): Promise<boolean> {
  const key = `ratelimit:enqueue:${agentId}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, AGENT_ENQUEUE_WINDOW);
  }

  return count <= AGENT_ENQUEUE_RATE_LIMIT;
}
```

Ak je limit prekročený: 429 `Agent enqueue rate limit exceeded. Max 10 per minute.`

## Backpressure

Ak celková hĺbka queue presiahne prah, systém odmietne nové enqueue:

```typescript
const QUEUE_DEPTH_THRESHOLD = 1000;

async function checkQueueBackpressure(): Promise<void> {
  const waiting = await queue.getWaitingCount();
  const delayed = await queue.getDelayedCount();
  const total = waiting + delayed;

  if (total > QUEUE_DEPTH_THRESHOLD) {
    throw new HttpException(
      'System busy, try again later',
      503
    );
  }
}
```

Threshold je konfigurovateľný cez env `QUEUE_DEPTH_THRESHOLD`. V produkcii sa hodnota nastaví podľa počtu runnerov a ich kapacity.

## Monitoring

### Metriky (Prometheus/Grafana)

| Metrika | Typ | Labels |
|---|---|---|
| `agentx_queue_depth` | gauge | `queue`, `state` (waiting/active/delayed) |
| `agentx_active_executions` | gauge | `agent_id`, `runner_id` |
| `agentx_execution_wait_time_seconds` | histogram | `agent_id` |
| `agentx_execution_duration_seconds` | histogram | `agent_id`, `status` |
| `agentx_enqueue_rejected_total` | counter | `reason` (concurrency/rate_limit/backpressure/budget) |
| `agentx_cron_skipped_total` | counter | `agent_id`, `trigger_id` |

### Alerty

- Queue depth > 500 po dobu 5 min → warning
- Queue depth > 1000 → critical (backpressure aktívny)
- Execution wait time p95 > 60s → warning
- Runner at full capacity > 10 min → scale up hint

## Horizontálne škálovanie

Viacero runner procesov konzumuje z toho istého BullMQ queue. Pridanie runnera = okamžité zvýšenie kapacity.

```
                    ┌──────────┐
                    │  BullMQ  │
                    │  Queue   │
                    └────┬─────┘
              ┌──────────┼──────────┐
              │          │          │
         ┌────▼───┐ ┌────▼───┐ ┌────▼───┐
         │Runner 1│ │Runner 2│ │Runner 3│
         │ (10)   │ │ (10)   │ │ (10)   │
         └────────┘ └────────┘ └────────┘
         Total capacity: 30 concurrent executions
```

### Kedy pridať runnery

| Signál | Akcia |
|---|---|
| Queue depth trvalo > 100 | Pridaj 1 runner |
| Wait time p95 > 30s | Pridaj 1 runner |
| Backpressure sa aktivuje | Urýchlene pridaj 2+ runnery |
| CPU usage runnera > 80% | Pridaj runner alebo zníž `RUNNER_CONCURRENCY` |

V Kubernetes: `HorizontalPodAutoscaler` na custom metriku `agentx_queue_depth`.

## Emergency controls

Admin API endpointy pre krízové situácie:

### Drain queue

```
POST /api/admin/queue/drain
```

Odstráni všetky waiting joby z queue. Active joby dobežia.

### Kill all executions for agent

```
POST /api/admin/agents/:agentId/kill
```

1. Zruší všetky waiting joby pre agenta
2. Pošle SIGTERM aktívnym exekúciám (Docker stop)
3. Vyčistí Redis set `agent:{id}:active`
4. Nastaví `agent.active = false`

### Pause all cron triggers

```
POST /api/admin/cron/pause
```

Globálny pause — žiadny cron trigger sa nefirne kým sa neresumne. Užitočné pri maintenance alebo incident response.

```
POST /api/admin/cron/resume
```

### Pause konkrétny agent

```
POST /api/admin/agents/:agentId/pause
```

Agent ostáva v DB, ale neprijíma nové exekúcie (webhook vráti 503, cron skips).

## Konfigurácia — súhrn

| Parameter | Default | Env var | Scope |
|---|---|---|---|
| Max concurrent per agent | 5 | — | per-agent v DB |
| Runner concurrency | 10 | `RUNNER_CONCURRENCY` | per-runner |
| Queue depth threshold | 1000 | `QUEUE_DEPTH_THRESHOLD` | global |
| Agent enqueue rate limit | 10/min | `AGENT_ENQUEUE_RATE_PER_MIN` | global |
| Execution timeout | 30 min | `EXECUTION_TIMEOUT_MS` | global |
| Stale execution cleanup | 5 min interval | `STALE_CLEANUP_INTERVAL_MS` | global |
