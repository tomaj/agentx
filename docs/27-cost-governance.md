# 27 — Cost Governance

Platforma beží s autonomnými agentmi — žiadne ľudské schvaľovanie počas exekúcie. Preto je kritické mať viacúrovňové nákladové limity, aby jeden zle nakonfigurovaný agent nevyčerpal celý budget organizácie.

## Tri úrovne budgetov

```
┌─────────────────────────────────┐
│  Per-org monthly budget         │  ← najvyššia úroveň
│  ┌───────────────────────────┐  │
│  │  Per-agent daily budget   │  │
│  │  ┌─────────────────────┐  │  │
│  │  │ Per-execution limit  │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

| Úroveň | Kde sa nastavuje | Default | Enforcement |
|---|---|---|---|
| Per-execution | `params.maxCostUsd` v agent config | $5 | runner zastaví exekúciu ak cost presiahne limit |
| Per-agent daily | `agents.daily_cost_limit_usd` | $10 | pred enqueue — reject ak denný budget vyčerpaný |
| Per-org monthly | `orgs.monthly_cost_limit_usd` | $100 (MVP) | pred enqueue — reject ak mesačný budget vyčerpaný |

## Databázový model

### Stĺpce na existujúcich tabuľkách

```sql
-- agents table
ALTER TABLE agents ADD COLUMN daily_cost_limit_usd numeric(10,4) DEFAULT 10.0;

-- orgs table
ALTER TABLE orgs ADD COLUMN monthly_cost_limit_usd numeric(10,4) DEFAULT 100.0;
```

### `daily_agent_costs`

Tabuľka (nie materialized view — potrebujeme rýchly upsert po každej exekúcii):

| Column | Type | Notes |
|---|---|---|
| agent_id | uuid FK agents | PK composite |
| date | date | PK composite |
| total_cost_usd | numeric(10,6) | suma za deň |
| execution_count | int | počet exekúcií |
| updated_at | timestamptz | |

```sql
CREATE TABLE daily_agent_costs (
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  execution_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, date)
);
```

### `monthly_org_costs`

| Column | Type | Notes |
|---|---|---|
| org_id | uuid FK orgs | PK composite |
| month | date | 1. deň mesiaca, PK composite |
| total_cost_usd | numeric(10,6) | |
| updated_at | timestamptz | |

## Enforcement flow

### Pred enqueue (hot path)

Kontrola budgetov musí byť rýchla. Používame Redis cache, aby sme na hot path nerobili DB query:

```
Redis keys:
  cost:agent:{agentId}:daily:{YYYY-MM-DD}  → current daily spend (numeric string)
  cost:org:{orgId}:monthly:{YYYY-MM}        → current monthly spend (numeric string)
  TTL: daily = 25h, monthly = 32 days
```

```typescript
async function checkBudgets(agent: Agent, org: Org): Promise<void> {
  const today = dayjs.utc().format('YYYY-MM-DD');
  const month = dayjs.utc().format('YYYY-MM');

  // Per-agent daily check
  const dailyCost = parseFloat(
    await redis.get(`cost:agent:${agent.id}:daily:${today}`) ?? '0'
  );
  if (dailyCost >= agent.dailyCostLimitUsd) {
    throw new HttpException(
      'Agent daily budget exceeded, resets at midnight UTC',
      429
    );
  }

  // Per-org monthly check
  const monthlyCost = parseFloat(
    await redis.get(`cost:org:${org.id}:monthly:${month}`) ?? '0'
  );
  if (monthlyCost >= org.monthlyCostLimitUsd) {
    throw new HttpException(
      'Organization monthly budget exceeded',
      429
    );
  }
}
```

### Po exekúcii (update)

Po dokončení exekúcie runner aktualizuje oba zdroje:

1. **DB** — `UPSERT` do `daily_agent_costs` a `monthly_org_costs`
2. **Redis** — `INCRBYFLOAT` na príslušných kľúčoch

```typescript
async function recordCost(execution: Execution): Promise<void> {
  const cost = execution.totalCostUsd;
  const today = dayjs.utc().format('YYYY-MM-DD');
  const month = dayjs.utc().format('YYYY-MM');

  // DB update (source of truth)
  await db.insert(dailyAgentCosts)
    .values({ agentId: execution.agentId, date: today, totalCostUsd: cost, executionCount: 1 })
    .onConflictDoUpdate({
      target: [dailyAgentCosts.agentId, dailyAgentCosts.date],
      set: {
        totalCostUsd: sql`daily_agent_costs.total_cost_usd + ${cost}`,
        executionCount: sql`daily_agent_costs.execution_count + 1`,
      },
    });

  // Redis cache update
  await redis.incrbyfloat(`cost:agent:${execution.agentId}:daily:${today}`, cost);
  await redis.incrbyfloat(`cost:org:${execution.orgId}:monthly:${month}`, cost);
}
```

## Circuit breaker

Ak agent má **3 po sebe idúce neúspešné exekúcie**, pričom **každá stála viac ako $1**, automaticky sa deaktivuje:

```typescript
async function checkCircuitBreaker(agent: Agent): Promise<void> {
  const recentExecutions = await db.query.executions.findMany({
    where: eq(executions.agentId, agent.id),
    orderBy: desc(executions.createdAt),
    limit: 3,
  });

  const allFailed = recentExecutions.length === 3
    && recentExecutions.every(e => e.status === 'failed' && e.totalCostUsd > 1);

  if (allFailed) {
    await db.update(agents)
      .set({ active: false, disabledReason: 'circuit_breaker' })
      .where(eq(agents.id, agent.id));

    await notifyOwner(agent, 'Agent bol automaticky deaktivovaný po 3 po sebe idúcich drahých zlyhaniach.');
  }
}
```

Opätovné zapnutie: manuálne cez UI alebo API. Agent sa nedá re-enablenúť kým owner nepotvrdí, že problém vyriešil.

## Alert thresholds

Notifikácia (email + in-app) sa odošle pri dosiahnutí prahovej hodnoty:

| Prah | Kto dostane notifikáciu |
|---|---|
| 50% denného agent budgetu | agent owner |
| 80% denného agent budgetu | agent owner |
| 100% denného agent budgetu | agent owner + org admins |
| 50% mesačného org budgetu | org admins |
| 80% mesačného org budgetu | org admins + owner |
| 100% mesačného org budgetu | org owner |

Implementácia: po `recordCost()` skontroluj pomer aktuálnych nákladov k limitu. Deduplikácia alertov cez Redis set `alerts:sent:{scope}:{id}:{threshold}:{period}` s TTL podľa periódy.

## Budget reset

- **Denný budget** — resetuje sa automaticky o 00:00 UTC. Redis kľúče expirujú cez TTL (25h). DB záznamy v `daily_agent_costs` ostávajú pre historické reporty.
- **Mesačný budget** — resetuje sa 1. dňa mesiaca. Redis kľúče expirujú cez TTL (32 dní).

Žiadny explicitný cron na reset nie je potrebný — nový deň/mesiac = nový kľúč.

## Emergency override

Org owner môže dočasne zdvihnúť budget:

```
POST /api/orgs/:orgId/budget-override
{
  "newLimitUsd": 500,
  "reason": "Critical production fix",
  "expiresAt": "2026-04-16T00:00:00Z"  // auto-expire, max 24h
}
```

Po expirácii sa automaticky vráti pôvodný limit. Override sa loguje do `audit_log`.

## Dashboard

Stránka **Settings → Costs** v admin UI:

- **Cost per agent** — bar chart, filtrované za posledných 7/30 dní
- **Projected monthly spend** — lineárna extrapolácia z aktuálnych dát
- **Top expensive agents** — tabuľka s agentmi zoradenými podľa mesačných nákladov
- **Daily cost trend** — line chart per-agent alebo agregát za org
- **Budget utilization** — progress bars pre denný/mesačný budget
- **Failed execution cost** — koľko stáli neúspešné exekúcie (potenciálne ušetriteľné)

## Konfigurácia cez UI

Agent edit stránka:

```
Daily cost limit:  [____$10.00____] USD
Per-execution max: [_____$5.00____] USD
```

Org settings stránka:

```
Monthly budget:    [___$100.00____] USD
Alert email:       [__admin@co.sk__]
```

## Edge cases

- **Redis výpadok** — fallback na DB query. Pomalšie, ale bezpečné. Ak ani DB nie je dostupná, reject enqueue (fail-safe).
- **Concurrent updates** — `INCRBYFLOAT` je atomický v Redis. DB upsert používa `ON CONFLICT` čo je tiež bezpečné.
- **Cost ešte nie je známy** — pri enqueue sa neodpočítava, iba sa kontroluje akumulovaný cost. Reálne náklady sa zaúčtujú až po exekúcii.
- **Nulový cost** — free-tier modely alebo cached responses: zaúčtuje sa $0, neovplyvní budget.
