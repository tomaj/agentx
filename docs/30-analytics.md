# 30 — Analytics & Reporting

## Ciel

Porozumiet efektivite agentov, nakladovym trendom, patternom pouzitia toolov a celkovemu zdraviu platformy. Analytika sluzi trom publikam:

1. **Org clenovia** — kolko stoja nase agenty, co zlyhava, kto je najaktivnejsi
2. **Agent tvorcovia** — ako sa moj agent sprava, kde su chyby, aky je trend nakladov
3. **Platform admin** — cross-org metriky, revenue, system health

---

## Datove zdroje

Vsetky data uz existuju v hlavnej Postgres DB:

| Tabulka | Co z nej tahame |
|---|---|
| `executions` | status, total_cost_usd, total_prompt_tokens, total_completion_tokens, started_at, ended_at, agent_id |
| `execution_events` | tool_call/tool_result eventy (nazov toolu, trvanie, chyby), error eventy |
| `agents` | meno, status, org_id, created_by |
| `orgs` | org metadata, billing info |

---

## Tri dashboardy

### 1. Org dashboard (vsetci clenovia org-u)

Dostupny cez `/dashboard/analytics`. Zobrazuje:

- **Cost this month** — suma `total_cost_usd` za aktualny mesiac, porovnanie s predchadzajucim
- **Executions this month** — pocet, breakdown `succeeded` / `failed` / `cancelled`
- **Top agents by usage** — top 10 agentov podla poctu executions alebo cost (toggle)
- **Recent failures** — poslednych 20 failed executions s error summary, link na detail
- **Cost trend** — line chart poslednych 30 dni (denne)

### 2. Agent detail analytics (per agent)

Dostupny cez `/agents/:id/analytics`. Zobrazuje:

- **Success rate** — % executions so statusom `succeeded` (7d / 30d / all-time)
- **Avg duration** — priemerne trvanie execution v sekundach
- **Avg cost** — priemerna `total_cost_usd` per execution
- **Tool call distribution** — pie chart: ktore MCP tooly agent najcastejsie vola
- **Error frequency** — bar chart: pocet chyb per tool per den
- **Cost trend** — line chart: daily cost za poslednych 7d / 30d
- **Token usage trend** — line chart: priemerne tokeny (prompt + completion) per execution per den

### 3. Platform admin dashboard (Phase 8)

Dostupny len pre system adminov. Cross-org prehlad:

- Revenue per org (mesacne)
- Celkove execution counts a cost
- System health: queue depth (BullMQ), avg queue wait time, worker utilization
- Najdrahsie agenty napriec platformou
- Org growth (novy orgs, novy agents per tyzdne)

---

## Implementacia: Materialized views

Priame queries nad `executions` a `execution_events` su pomale pri velkom volume. Riesenie: **materialized views** refreshovane periodicky.

### Refresh strategia

BullMQ repeatable job `refresh-analytics` — kazdych 5 minut:

```ts
await analyticsQueue.add('refresh-materialized-views', {}, {
  repeat: { every: 5 * 60 * 1000 },
});
```

Worker vykona:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_agent_stats;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_org_stats;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tool_usage_stats;
```

`CONCURRENTLY` umoznuje citanie pocas refreshu (vyzaduje unique index na view).

### `mv_daily_agent_stats`

```sql
CREATE MATERIALIZED VIEW mv_daily_agent_stats AS
SELECT
  agent_id,
  date_trunc('day', started_at)::date AS date,
  COUNT(*) AS execution_count,
  COUNT(*) FILTER (WHERE status = 'succeeded') AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  SUM(total_cost_usd) AS total_cost,
  AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::int AS avg_duration_ms,
  SUM(total_prompt_tokens + total_completion_tokens) AS total_tokens
FROM executions
WHERE started_at IS NOT NULL
GROUP BY agent_id, date_trunc('day', started_at)::date;

CREATE UNIQUE INDEX ON mv_daily_agent_stats (agent_id, date);
```

### `mv_daily_org_stats`

```sql
CREATE MATERIALIZED VIEW mv_daily_org_stats AS
SELECT
  a.org_id,
  date_trunc('day', e.started_at)::date AS date,
  COUNT(*) AS execution_count,
  SUM(e.total_cost_usd) AS total_cost,
  COUNT(DISTINCT e.agent_id) AS active_agents
FROM executions e
JOIN agents a ON a.id = e.agent_id
WHERE e.started_at IS NOT NULL AND a.org_id IS NOT NULL
GROUP BY a.org_id, date_trunc('day', e.started_at)::date;

CREATE UNIQUE INDEX ON mv_daily_org_stats (org_id, date);
```

### `mv_tool_usage_stats`

```sql
CREATE MATERIALIZED VIEW mv_tool_usage_stats AS
SELECT
  e.agent_id,
  ee.payload->>'name' AS tool_name,
  date_trunc('day', ee.timestamp)::date AS date,
  COUNT(*) AS call_count,
  COUNT(*) FILTER (WHERE (ee.payload->>'isError')::bool = true) AS error_count,
  AVG((ee.payload->>'durationMs')::numeric)::int AS avg_duration_ms
FROM execution_events ee
JOIN executions e ON e.id = ee.execution_id
WHERE ee.type = 'tool_result'
GROUP BY e.agent_id, ee.payload->>'name', date_trunc('day', ee.timestamp)::date;

CREATE UNIQUE INDEX ON mv_tool_usage_stats (agent_id, tool_name, date);
```

---

## API endpoints

| Endpoint | Popis | Auth |
|---|---|---|
| `GET /analytics/org` | Org dashboard data (cost, executions, top agents) | org member |
| `GET /analytics/org?range=7d\|30d\|90d` | Casovy rozsah | org member |
| `GET /analytics/agents/:id` | Agent detail metriky | agent owner / org admin |
| `GET /analytics/agents/:id/tools` | Tool usage breakdown pre agenta | agent owner / org admin |
| `GET /analytics/platform` | Admin dashboard (Phase 8) | system admin |

Response format — priklad `/analytics/agents/:id`:

```json
{
  "agentId": "uuid",
  "range": "30d",
  "summary": {
    "executionCount": 342,
    "successRate": 0.94,
    "avgDurationMs": 12400,
    "avgCostUsd": 0.0234,
    "totalCostUsd": 8.01,
    "totalTokens": 1240000
  },
  "daily": [
    { "date": "2026-04-14", "executions": 12, "cost": 0.28, "avgDuration": 11200, "tokens": 38000 },
    { "date": "2026-04-13", "executions": 15, "cost": 0.35, "avgDuration": 13100, "tokens": 45000 }
  ],
  "toolUsage": [
    { "tool": "github__list_issues", "calls": 120, "errors": 2, "avgDurationMs": 340 },
    { "tool": "slack__send_message", "calls": 98, "errors": 0, "avgDurationMs": 210 }
  ]
}
```

---

## UI komponenty

| Komponent | Kniznica | Pouzitie |
|---|---|---|
| Line chart (cost trend, tokens trend) | recharts `<LineChart>` | Org dashboard, Agent detail |
| Bar chart (error frequency, executions/day) | recharts `<BarChart>` | Agent detail |
| Pie chart (tool distribution) | recharts `<PieChart>` | Agent detail |
| Summary cards (cost, count, rate) | shadcn `<Card>` | Vsetky dashboardy |
| Data tables (failures, top agents) | shadcn `<Table>` + `<DataTable>` | Org dashboard |
| Date range picker | shadcn `<DatePicker>` | Vsetky dashboardy |

---

## Klucove metriky

| Metrika | Zdroj | Poznamka |
|---|---|---|
| Execution success rate (%) | `mv_daily_agent_stats` | success_count / execution_count |
| Mean time to completion (s) | `mv_daily_agent_stats` | avg_duration_ms / 1000 |
| Cost per execution (USD) | `mv_daily_agent_stats` | total_cost / execution_count |
| Tool error rate per MCP server | `mv_tool_usage_stats` | error_count / call_count, grouped by tool prefix |
| Tokens per execution | `mv_daily_agent_stats` | total_tokens / execution_count |
| Active agents (24h) | `executions` | COUNT DISTINCT agent_id WHERE started_at > now() - 24h |
| Queue wait time p50/p95 | BullMQ metrics | cas medzi `queued` a `running` statusom |

---

## Export

Kazdy analytics view je mozne exportovat ako **CSV**:

- Tlacidlo "Export CSV" v UI na kazdom dashboarde
- API: `GET /analytics/org/export?format=csv&range=30d`
- Server-side generovanie CSV streamu (nie client-side, kvoli velkym datasetom)
- Limit: max 10 000 riadkov per export

---

## Alerting (Phase 7)

Metriky feed-uju do notification systemu. Konfigurovatelne per-org pravidla:

```ts
// Priklad alert rules
const alertRules = [
  { metric: 'agent_success_rate', condition: 'lt', value: 0.8, window: '1h', channel: 'email' },
  { metric: 'org_daily_cost', condition: 'gt', value: 50.0, window: '1d', channel: 'slack' },
  { metric: 'tool_error_rate', condition: 'gt', value: 0.1, window: '30m', channel: 'email' },
];
```

Evaluacia: BullMQ repeatable job kazdych 5 minut kontroluje pravidla voci aktualnym materialized views.

---

## Data retention

| Data | Retencia | Poznamka |
|---|---|---|
| Materialized views (daily aggregaty) | 12 mesiacov | Starsie sa mazzu cron jobom |
| `execution_events` (raw data) | 90 dni | Vlastna retencia — vid `09-observability.md` |
| `executions` | neobmedzene | Sumarizovane data (cost, tokens) su male |

Po expirovanej retencii materialized views sa data stratia z detailnych chartov, ale `executions` summary zostava pre historicke cost reporting.

---

## Phase plan

| Phase | Scope |
|---|---|
| Phase 1 | Zakladne: zoznam executions s cost display, filtrovanie podla statusu |
| Phase 4 | Org dashboard: cost trend, top agents, recent failures. Materialized views. |
| Phase 5 | Agent detail analytics: success rate, duration, tool usage charts |
| Phase 7 | Plna analytika: alerting, export CSV, embedding cost tracking |
| Phase 8 | Platform admin dashboard: cross-org metriky, revenue, system health |
