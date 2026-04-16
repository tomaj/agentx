# 11 — Meta-agent (Agent Builder)

Zabudovaný systémový agent, ktorého úlohou je **vytvárať iných agentov** cez konverzáciu s userom. User sa s ním rozpráva prirodzenou rečou, on sa ho opýta na všetko potrebné a výsledkom je vytvorený `agent` v systéme.

## UX flow

1. User v UI klikne "Create Agent" → dá vybrať:
   - **Manually** → štandardný form (name, system prompt, model, MCP bindings…)
   - **Talk to Agent Builder** → otvorí chat session s meta-agentom
2. Agent Builder začne dialog: "Čo má tento agent robiť? Kto ho bude používať? Kde sa bude spúšťať?"
3. Dopytuje sa iteratívne, vyvoláva clarifying otázky, navrhuje
4. Keď má dosť info, ukáže user preview ("Toto je čo plánujem vytvoriť: ...") → confirm
5. Zavolá internal tool `create_agent` → agent je vytvorený
6. User vidí link "Váš agent bol vytvorený: [link]"

## Implementácia

Meta-agent je **obyčajný agent** v systéme s niekoľkými špeciálnymi vlastnosťami:

- Je **seeded** pri prvom boote (migration `seed_meta_agent.sql` alebo zo `scripts/`)
- Má vyhradený `agent_id` (konštanta v `@agentx/shared`, napr. `META_AGENT_ID`)
- Nemôže byť zmazaný user-om (DB constraint alebo app-level guard)
- UI ho zobrazí v špeciálnej sekcii ("Built-in agents"), nie v bežnom zozname
- **Default model:** `claude-sonnet-4-6` (dobrý pomer kvality a ceny pre dialogové prompty s častými nástrojovými volaniami)
- **Model pinning:** Meta-agent má **pinned snapshot** (napr. `claude-sonnet-4-6-YYYYMMDD`), nie rolling alias. Dôvod: jeho správanie ovplyvňuje prvý dojem pre každého nového agenta, nechceme silent changes. Upgrade iba po pass cez eval suite (viď `20-llm-evals.md`).

### System prompt (skica)

```
You are Agent Builder, the meta-agent of the agentx platform. Your job is to
interview users and create a new agent on their behalf.

When a user wants a new agent:
1. Ask clarifying questions to understand:
   - The agent's purpose (one-sentence mission).
   - Who will trigger it and how (HTTP webhook / chat / cron).
   - What tools/MCP servers it needs access to.
   - What the output format should be.
   - Which LLM provider/model makes sense (ask about latency/cost tradeoffs).

2. List available MCP servers using the `list_mcp_servers` tool. Recommend
   the minimum set of tools required — don't overload the agent.

3. If the user isn't sure about a field, suggest a sensible default and
   explain the trade-off.

4. Before creating the agent, show a preview of the full configuration and
   ask for explicit confirmation.

5. Call `create_agent` with the final spec. Include a draft system prompt
   for the new agent that is focused and includes example of its expected
   output.

6. After creation, link to the new agent and offer to help test it.

Keep your tone collaborative and concise. If the user gives a vague
description, don't invent details — ask.
```

### Tools (špeciálne, nie MCP)

Meta-agent má **interné tools** poskytované runtime-om (nie cez MCP), pretože operujú na vlastnej platforme:

| Tool | Popis |
|---|---|
| `list_mcp_servers()` | Vráti katalóg dostupných MCP serverov s popisom |
| `list_user_credentials(mcpServerSlug)` | Aké credentials má user pre daný MCP |
| `suggest_model(useCase, constraints)` | Vráti pricing + capability info pre dostupné modely |
| `create_agent(spec)` | Vytvorí `agents` + `agent_versions` + bindings |
| `create_trigger(agentId, type, config)` | Pridá trigger |

Implementácia: `packages/agent-core` má trieda `InternalToolProvider` — registruje sa iba pre meta-agenta. Runtime pri starte runu sa pozrie, či `agent.id == META_AGENT_ID`, ak áno, nahrá aj internal tools vedľa MCP tools.

### Bezpečnosť

- `create_agent` tool vytvorí agenta **v kontexte ownera** meta-agent chat session-y (nie system-wide)
- Rate limit: max 10 createnutých agentov za hodinu per user (anti-abuse)
- Audit log: každá operácia meta-agenta ide do `audit_log` s `actor_id=user` a `metadata.via_meta_agent=true`

### Zmeniteľnosť

System prompt meta-agenta uložíme v DB (agent_versions), aby sme ho mohli tuneovať cez UI bez deployu. Pri migrácii iba seednime inicálnu verziu; ďalšie verzie môžu vznikať cez prompt engineering workflow platformu.

## Roadmap

**MVP:** Agent Builder existuje, chat-first vytvorenie agenta funguje, konfiguruje prompt + model + MCP bindings + 1 trigger.

**Phase 2:** 
- Agent Editor (meta-agent ktorý aj existujúceho agenta upraví — "add GitHub tool to my scheduler agent")
- Agent Tester (meta-agent spustí novo-vytvoreného agenta s mock input-om a ukáže výsledok pred finalizáciou)

**Phase 3:**
- Marketplace / templates — preset agent configs ("Slack summarizer", "PR reviewer"), meta-agent odporúča template podľa use-case
