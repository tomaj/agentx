# 21 — Example: "Morning Jira Digest" Agent

End-to-end príklad. Ukazuje **každý krok** od user requestu cez vytvorenie agenta (cez Agent Builder) až po konkrétny beh v pondelok ráno — s presnými správami medzi userom, LLM, MCP toolmi a DB.

## Scenario

> "Chcem aby mi každé ráno o 8:00 prišiel email s tým, aké Jira issues sú otvorené v aktuálnom sprinte."

---

## Časť 1 — Predpoklady

Pred vytvorením agenta user už v UI:

1. V **MCP katalógu** klikol "Connect" pri **Jira** → zadal API token → uložený ako `mcp_credentials` s label "Main Jira"
2. V **MCP katalógu** klikol "Connect" pri **Gmail** → prešiel OAuth → uložené ako `mcp_credentials` s label "Work Gmail"

V DB:
```sql
mcp_credentials
  id=cred_jira_1    owner=user_tomaj  server=jira    label="Main Jira"
  id=cred_gmail_1   owner=user_tomaj  server=gmail   label="Work Gmail"
```

---

## Časť 2 — Vytvorenie cez Agent Builder

User klikne **"Create Agent → With Builder"**.

```
🤖 Hi! I'll help you create an agent. What do you want it to do?

tomaj:  Chcem aby mi každé ráno o 8:00 prišiel email s tým, aké Jira issues
        sú otvorené v aktuálnom sprinte.

🤖 Got it — a morning digest of open sprint issues via email. A few things
    I need to clarify:

    1. Which Jira project? (you can give me the key, e.g. "ENG")
    2. Active sprint means Jira's currently-active sprint for that
       project's board, correct?
    3. Email: your own email, or a specific address? What subject line
       format do you prefer?
    4. Timezone — 8:00 local Bratislava time?

tomaj:  1) projekt ENG
        2) ano, aktualny active sprint
        3) posli mi to na tomas@acme.com, predmet "Jira sprint digest - <datum>"
        4) 8:00 Bratislava, len pracovne dni

🤖 Perfect. Let me check what tools you have connected.

    [tool_call: list_user_credentials(mcpServerSlug="jira")]
    → found: "Main Jira"

    [tool_call: list_user_credentials(mcpServerSlug="gmail")]
    → found: "Work Gmail"

🤖 Both connected. I also want to confirm model choice:

    - Sonnet 4.6 (default): good balance, ~$0.005 per execution. Recommended.
    - Haiku 4.5: faster and cheaper (~$0.001), might be enough for this.
    - Opus 4.6: overkill for summarization.

    Happy with Sonnet, or want Haiku?

tomaj:  Sonnet je ok

🤖 Here's what I'm going to create:

    Name: Morning Jira Digest
    Description: Sends a daily email with open issues from the ENG
                 project's active sprint.
    Model: claude-sonnet-4-6
    Tools:
      - jira (Main Jira) — only: list_issues, get_sprint
      - gmail (Work Gmail) — only: send_email
    Trigger: Cron, "0 8 * * 1-5" (Mon-Fri 8:00), Europe/Bratislava
    System prompt: [expand to see full text]

    Shall I create it? (yes / no / change X)

tomaj:  yes

🤖 [tool_call: create_agent({...})]   → created agent_abc123
    [tool_call: create_trigger(agentId="agent_abc123", type="cron", ...)]
                                        → created trigger_xyz456

🤖 Done. Your agent is at /agents/agent_abc123. Want me to run it now
    once to verify it works?

tomaj:  hej spusti to

🤖 [tool_call: trigger_test_run(triggerId="trigger_xyz456")]
    → run started: run_test_001

    Streaming the run — check the execution viewer: /executions/run_test_001
```

---

## Časť 3 — Aký agent vznikne v DB

```sql
agents
  id=agent_abc123
  org_id=org_acme
  name="Morning Jira Digest"
  description="Sends a daily email with open issues..."
  current_version_id=ver_1
  status=active
  created_by=user_tomaj

agent_versions
  id=ver_1
  agent_id=agent_abc123
  version=1
  system_prompt=<see below>
  model_provider="anthropic"
  model_id="claude-sonnet-4-6"
  params={ temperature: 0.2, maxIterations: 10, maxCostUsd: 0.10, maxTokens: 2000 }
  tools_config={}  // implicitly all bindings' tools

agent_mcp_bindings
  agent_id=agent_abc123  mcp_server=jira   credential_id=cred_jira_1
                         allowed_tools=["list_issues","get_sprint"]
  agent_id=agent_abc123  mcp_server=gmail  credential_id=cred_gmail_1
                         allowed_tools=["send_email"]

triggers
  id=trigger_xyz456
  agent_id=agent_abc123
  type=cron
  name="Weekdays 8am"
  config={ expression: "0 8 * * 1-5", timezone: "Europe/Bratislava" }
  enabled=true
```

**System prompt** (vytvorený Agent Builderom, user môže editovať):

```
You are a daily digest agent. Every weekday morning, your job is to:

1. Fetch the currently-active sprint from Jira project "ENG" using
   jira__get_sprint with the project key.
2. List all issues in that sprint that are NOT in status "Done" or
   "Cancelled" using jira__list_issues with appropriate JQL.
3. Group issues by assignee and format a concise summary.
4. Send the summary as an email to tomas@acme.com via gmail__send_email.
   Subject format: "Jira sprint digest - <YYYY-MM-DD>".

Requirements:
- Email body: plain text, grouped by assignee, format:
    "<assignee name>: <issue-key> - <summary> (status)"
- If no open issues: send email anyway with "All sprint issues are done."
- If the sprint endpoint returns no active sprint: send email noting that.
- Keep the email under 200 lines.

Use tools in sequence; do not speculate about issues.
```

---

## Časť 4 — Exekúcia v pondelok ráno

### 07:59:58 — Scheduler

BullMQ repeatable job vystrelí o 8:00:00 presne. Handler:

```ts
// scheduler/handlers/cron.ts
async function onCronFire(triggerId: string) {
  const trigger = await triggerRepo.findById(triggerId);
  if (!trigger.enabled) return;

  const agent = await agentRepo.findById(trigger.agentId);
  const run = await runRepo.create({
    agentId: agent.id,
    agentVersionId: agent.currentVersionId,
    triggerId,
    triggerType: "cron",
    status: "queued",
    input: { triggeredAt: new Date().toISOString() },
    initiatedBy: null,
  });

  await queue.add("run", { executionId: run.id }, { priority: 10 });  // low priority
}
```

### 08:00:00.042 — Runner pickne job

```ts
// runner/processors/run.processor.ts
async process(job: Job<{ executionId: string }>) {
  const runner = new AgentExecutor(/* deps */);
  await runner.execute(job.data.executionId);
}
```

`AgentExecutor.execute()`:
1. Load `run`, `agent_version`, `bindings`
2. Mark `executions.status='running'`, `started_at=now`
3. Emit `run_started`
4. Init folder sandbox: `./workspaces/run_20260416_080000/`
5. Load MCP clients:
   - Spawn `jira` (stdio): `node node_modules/@modelcontextprotocol/server-jira` s env `JIRA_API_TOKEN=<decrypted>` a `JIRA_HOST=acme.atlassian.net`
   - Spawn `gmail` (stdio): s env `GOOGLE_OAUTH_ACCESS_TOKEN=<decrypted, refreshed if needed>`
6. `tools/list` na každom MCP → zber:
   ```
   [
     { name: "jira__get_sprint", inputSchema: {...} },
     { name: "jira__list_issues", inputSchema: {...} },
     { name: "gmail__send_email", inputSchema: {...} },
   ]
   ```
   (filtered podľa `allowed_tools`)

### 08:00:00.340 — LLM iterácia #1

**Messages state:**
```json
[
  { "role": "system", "content": "<system prompt above>" },
  { "role": "user", "content": "Scheduled run at 2026-04-16T06:00:00Z (Europe/Bratislava 08:00). Execute your task." }
]
```

**Emit `llm_request`** do `execution_events`:
```json
{ "type": "llm_request", "model": "claude-sonnet-4-6",
  "messages": [...], "tools": [...], "params": { "temperature": 0.2 } }
```

Runner cez Vercel AI SDK zavolá Anthropic API (streaming).

### 08:00:02.120 — LLM response #1

Chunks prichádzajú, emit `llm_chunk` eventy (throttled každých 100ms alebo 20 chunks, nie každý token do DB).

Final response:
```json
{
  "text": "I'll fetch the active sprint for ENG project.",
  "toolCalls": [
    { "id": "tc_1", "name": "jira__get_sprint", "args": { "projectKey": "ENG", "state": "active" } }
  ],
  "usage": { "promptTokens": 1820, "completionTokens": 68 },
  "finishReason": "tool_use"
}
```

**Emit `llm_response`**. Update budget: `cost += 1820 * 3/1M + 68 * 15/1M = $0.006`.

### 08:00:02.180 — Tool call #1

Runner emit `tool_call` event, potom zavolá MCP client:

```ts
const result = await mcpClients.jira.callTool({
  name: "get_sprint",
  arguments: { projectKey: "ENG", state: "active" }
});
```

Stdio proces dostane JSON-RPC message, API zavolá Jira REST, vráti:

```json
{
  "content": [{ "type": "text", "text": "{\"id\":42,\"name\":\"Sprint 23\",\"state\":\"active\",\"startDate\":\"2026-04-14\",\"endDate\":\"2026-04-28\"}" }],
  "isError": false
}
```

**Emit `tool_result`** (durationMs: 620).

Messages appendu tool result:
```json
[...,
  { "role": "assistant", "content": [
      { "type": "text", "text": "I'll fetch the active sprint..." },
      { "type": "tool_use", "id": "tc_1", "name": "jira__get_sprint", "input": {...} }
  ]},
  { "role": "user", "content": [
      { "type": "tool_result", "tool_use_id": "tc_1",
        "content": "{\"id\":42,\"name\":\"Sprint 23\",...}" }
  ]}
]
```

### 08:00:02.850 — LLM iterácia #2

Runner cyklom znova → LLM call s updated messages.

LLM response:
```json
{
  "text": "Found active Sprint 23. Now fetching open issues.",
  "toolCalls": [{
    "id": "tc_2",
    "name": "jira__list_issues",
    "args": {
      "jql": "sprint = 42 AND status NOT IN (\"Done\", \"Cancelled\")",
      "fields": ["key", "summary", "status", "assignee"],
      "maxResults": 100
    }
  }],
  "usage": { "promptTokens": 2100, "completionTokens": 120 }
}
```

Cost update: `cost += $0.008` → total `$0.014`.

### 08:00:04.010 — Tool call #2

```ts
mcpClients.jira.callTool({ name: "list_issues", arguments: {...} })
```

Result (durationMs: 890):
```json
{
  "content": [{ "type": "text", "text":
    "[{\"key\":\"ENG-101\",\"summary\":\"Fix auth bug\",\"status\":\"In Progress\",\"assignee\":\"alice@acme.com\"},{\"key\":\"ENG-102\",\"summary\":\"Refactor API\",\"status\":\"To Do\",\"assignee\":\"bob@acme.com\"},{\"key\":\"ENG-103\",\"summary\":\"Add tests\",\"status\":\"In Progress\",\"assignee\":\"alice@acme.com\"},...(7 total)]"
  }],
  "isError": false
}
```

### 08:00:05.200 — LLM iterácia #3

Messages majú teraz aj tool_result s 7 issues. Response:

```json
{
  "text": "Got 7 open issues. Composing and sending email.",
  "toolCalls": [{
    "id": "tc_3",
    "name": "gmail__send_email",
    "args": {
      "to": "tomas@acme.com",
      "subject": "Jira sprint digest - 2026-04-16",
      "body": "Sprint 23 (2026-04-14 → 2026-04-28) — 7 open issues\n\nalice@acme.com:\n  ENG-101 - Fix auth bug (In Progress)\n  ENG-103 - Add tests (In Progress)\n  ...\n\nbob@acme.com:\n  ENG-102 - Refactor API (To Do)\n  ..."
    }
  }],
  "usage": { "promptTokens": 2650, "completionTokens": 340 }
}
```

Cost: `+$0.013` → total `$0.027`.

### 08:00:07.450 — Tool call #3

Gmail MCP posiela email cez Gmail API. Result:
```json
{ "content": [{ "type": "text", "text": "{\"messageId\":\"abc123def\",\"threadId\":\"xyz789\"}" }], "isError": false }
```

(durationMs: 1120)

### 08:00:08.590 — LLM iterácia #4 (final)

```json
{
  "text": "Email sent to tomas@acme.com with 7 issues grouped by assignee.",
  "toolCalls": [],
  "usage": { "promptTokens": 3010, "completionTokens": 28 },
  "finishReason": "stop"
}
```

Cost: `+$0.010` → total `$0.037`.

### 08:00:08.600 — Runner finalizes

```ts
// No tool calls + finishReason=stop → exit loop
await emit({
  type: "run_completed",
  status: "succeeded",
  output: { text: "Email sent to tomas@acme.com with 7 issues..." },
  budget: { promptTokens: 9580, completionTokens: 556, costUsd: 0.037 }
});

await runRepo.update(executionId, {
  status: "succeeded",
  ended_at: new Date(),
  total_prompt_tokens: 9580,
  total_completion_tokens: 556,
  total_cost_usd: 0.037,
  output: {...}
});

// Cleanup
await Promise.all(mcpClients.map(c => c.close()));
await sandbox.cleanup();  // zmaže ./workspaces/run_20260416_080000/
```

**Total duration: 8.6 sekundy. Total cost: $0.037.**

---

## Časť 5 — Čo vidí user

### Ak je v dashboarde

V `/executions` sa objaví nový row (SSE update):
```
Morning Jira Digest | cron | ● running → ✓ ok | 08:00:00 | 9s | $0.04
```

Klikne → `/executions/run_20260416_080000` → vidí kompletný timeline (5 hlavných udalostí: 4 LLM volania + 3 tool pairs + start/complete eventy).

### Email v Gmaili

```
From: tomas@acme.com (cez Gmail MCP)
To: tomas@acme.com
Subject: Jira sprint digest - 2026-04-16

Sprint 23 (2026-04-14 → 2026-04-28) — 7 open issues

alice@acme.com:
  ENG-101 - Fix auth bug (In Progress)
  ENG-103 - Add tests (In Progress)
  ENG-107 - Review PR queue (In Progress)

bob@acme.com:
  ENG-102 - Refactor API (To Do)
  ENG-105 - Deploy to staging (In Progress)

unassigned:
  ENG-108 - New feature proposal (To Do)
  ENG-110 - Doc update (To Do)
```

### Notification bell (ak je odhlásený)

Defaultne cron runy nenotifikujú user-a pri success (inak by z bellu cron-u bol spam). **Notifikujú len pri failure**, alebo ak user v trigger configu zapne `notify_on_success`.

---

## Časť 6 — Error scenáre

### A) Jira token expired (401)

Iterácia #2, `jira__list_issues` vráti `isError: true, content: "401 Unauthorized"`.

Runner:
1. Detekuje auth error z MCP response
2. Skúsi **refresh credential** (pre static token to nerobí — len logne; pre OAuth by spustil refresh flow)
3. Ak zlyhá refresh: posunie tool error LLM-u

LLM v iterácii #3 dostane tool result:
```json
{ "type": "tool_result", "tool_use_id": "tc_2",
  "content": "Error: Jira API returned 401 Unauthorized. Credential may have expired.",
  "is_error": true }
```

LLM response (agent sa rozhodne):
```json
{ "text": "I can't reach Jira right now — authentication failed. Notifying you via email instead.",
  "toolCalls": [{ "name": "gmail__send_email", "args": {
    "to": "tomas@acme.com",
    "subject": "⚠ Morning Jira digest failed - 2026-04-16",
    "body": "Couldn't fetch sprint data: Jira authentication expired. Please re-connect your Jira credential in agentx."
  }}]
}
```

Run status: `succeeded` (agent handled it gracefully a poslal alert email).

**Alebo** (ak by sme to neurobili v agent loop-e): runner po N consecutive auth errors abortuje run so `status='failed'`, error payload obsahuje "mcp_auth_failed", notifikácia v bell-e: "Your credential is expired — refresh it".

### B) Gmail rate-limit (429)

Tool result `is_error: true, content: "429 rate limit"`. Runner má **automatic retry wrapper** okolo `callTool`:
- Retry 3× s exponential backoff (1s, 2s, 4s)
- Ak stále fail → bubble up do LLM ako tool error
- Run-level: celá run má max `10 min` timeout

### C) LLM halucinuje zlý tool argument

Napr. LLM pošle `jira__list_issues` s chybným JQL `sprint = active AND assignee = me`. Jira vráti `isError: true, content: "Invalid JQL: Cannot use function 'me' with..."`.

LLM iterácia #3 dostane tool error → sám navrhne fix → retry. Pokrýva sa bežnou tool-use logikou.

Ak LLM opakovane fail-uje ten istý tool (detegované cez rovnaký `tool_name` + podobný error 3×): abort run, nech nešplháme cenu → `status='failed'`, error payload `"repeated_tool_failure"`.

### D) Provider outage (Anthropic 503)

Vercel AI SDK throw-ne error. Runner's retry wrapper okolo LLM call:
- 3× s backoff
- Ak všetky zlyhajú: run `status='failed'`, retry flag v BullMQ → job sa retriuje za 5 minút (max 3 retry attempty)
- Ak aj to fail: `status='failed'` permanentne, email notifikácia

### E) Max cost exceeded

`budget.costUsd > maxCostUsd (0.10)` v strede runu → throw `BudgetExceededError`. Run status `failed`, error `"budget_exceeded"`, notifikácia user-ovi.

### F) Cron runner bol down o 8:00

- BullMQ repeatable job má next-run timestamp
- Ak runner bol down v 8:00 a nabootuje sa 8:03 → BullMQ už má new next-run time **pre zajtra**, dnešný run sa **neuskutoční** (default backfill=false)
- User dostane notif "Scheduled run was missed due to system downtime" (Phase 7+ feature)

### G) User medzitým zmenil agent config

- Cron fire → create run → run zamrazí **pôvodný** `agent_version_id` v momente enqueueu
- Ak user zmenil agenta medzitým: nový `agent_version` vznikne, ale bežiaci run ide so starým
- Staré runy v histórii si zobrazia vtedy-aktuálny config (nie mutated)

---

## Časť 7 — Ako vyzerá `execution_events` tabuľka

Pre tento jeden run (zjednodušené):

| seq | timestamp | type | payload (summarized) |
|----|-----------|------|---------------------|
| 1 | 08:00:00.042 | `run_started` | input |
| 2 | 08:00:00.340 | `llm_request` | messages (2), tools (3), model |
| 3 | 08:00:00.342 | `llm_chunk` | "I'll" |
| 4-40 | ... | `llm_chunk` | (throttled nicher) |
| 41 | 08:00:02.120 | `llm_response` | text, toolCalls: [tc_1], usage |
| 42 | 08:00:02.180 | `tool_call` | id=tc_1, name=jira__get_sprint, args |
| 43 | 08:00:02.800 | `tool_result` | id=tc_1, result, durationMs=620 |
| 44 | 08:00:02.850 | `llm_request` | messages (4), tools (3) |
| ... | ... | ... | ... |
| 120 | 08:00:08.600 | `run_completed` | status=succeeded, budget |

UI timeline group-uje: llm_chunks sa nerenderujú ako separate items — sa použijú iba pre live-type-into-ui efekt, finálny záznam je `llm_response`.

---

## Časť 8 — Rozpočet pre tento konkrétny agent

Priemer za 7.8s na beh × cca 22 pracovných dní = **22 runov/mesiac**. Cena: **22 × $0.037 = $0.81/mesiac**. Nič.

**Keby to bežalo na Opus 4.6:** 22 × $0.37 = $8/mesiac. Stále nič.

**Keby bol system prompt 10×** (50k tokens context) a história bola 200k tokens: `22 × 200k × $15/1M + ...` = $60-80/mesiac — vtedy by bolo treba optimalizovať (compaction, smaller model).

---

## Časť 9 — Čo z tohoto príkladu vyplýva pre návrh

1. **Agent musí tolerovať tool errory gracefully** — runtime im nedáva magic recovery, LLM ich prispôsobí. System prompt by mal toto explicit zmieniť ("If a tool fails, tell the user via email").
2. **Retry logic je na úrovni `callTool`, nie bulk run** — len sieťové a 429 chyby retry-ujeme automaticky. Semantic errory (bad JQL) riešia LLM sám.
3. **Duplicate / repeat detection** — ak LLM volá ten istý tool s tým istým error 3×, radšej abort (prevencia halucinujúceho loopu).
4. **Cron semantika je "fire-and-forget per scheduled tick"** — žiadny backfill, žiadny debounce. Pre istotu doplníme "last success at" tracking pre UI.
5. **Cost tracking musí fungovať aj keď run failne** — `total_cost_usd` je cumulative, updated po každej LLM iterácii, nie len na konci.
6. **Tool calls v parallel** — Claude Opus/Sonnet podporujú viacero tool calls v jednej response. V loop-e ich spustíme `Promise.allSettled` — iteration v Jira example mala 1 naraz, ale agent čo robí research (2 HTTP fetches) by profitoval z paralelizmu. **Rozhodnutie v TODO:** allow parallel tool execution — default true, opt-out na úrovni agenta.
