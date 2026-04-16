# 00 — Overview

## Čo je agentx

Platforma, v ktorej si používateľ cez web UI **vytvorí AI agenta** (prompt, model, sada toolov), **pripojí credentials** pre tools a potom ho **spúšťa** — cez HTTP webhook, chat, alebo na cron. Počas behu vidí v reálnom čase presne **čo agent robí** (ako v Claude Code desktop: aký tool volá, s akými argumentmi, čo vrátil).

## Hlavné use-cases

- **Automatizácia rutinných úloh** — "každé ráno o 8:00 pozri moje GitHub issues a zosumarizuj ich do Slacku"
- **Webhook-driven agenti** — "keď príde nový support ticket, klasifikuj ho a priraď owner-a"
- **Ad-hoc asistent** — chat s agentom, ktorý má prístup k firemným dátam cez MCP
- **Agent-building-agent** — meta-agent, ktorý sa ťa pýta na use-case a vygeneruje/uloží kompletnú definíciu agenta za teba

## Kľúčové koncepty (slovník)

| Pojem | Význam |
|---|---|
| **Agent** | Nakonfigurovaná entita: meno, system prompt, model, provider, sada priradených MCP serverov, parametre (temperature…). Má verzie. |
| **MCP Server** | Externý nástrojový server (Model Context Protocol). Poskytuje agentovi tools (napr. GitHub, Linear, Gmail, shell…). |
| **MCP Credential** | Per-user + per-MCP tajomstvo (token / OAuth tokens). Agent používa credentials svojho ownera. |
| **Trigger** | Spôsob, ako sa agent spúšťa: `http` (webhook), `chat` (z admin UI), `cron` (časovač). |
| **Run** | Jedna exekúcia agenta. Má status, štart/koniec, tokeny, náklady, audit trail. |
| **ExecutionEvent** | Jedna udalosť v rámci runu (user msg, assistant msg, tool call, tool result, log, error). |
| **ChatSession** | Trvalá konverzácia medzi userom a agentom v admin UI. Obsahuje N runov. |
| **Sandbox** | Izolované prostredie pre jeden run (folder v dev, Docker container v prod). |
| **Meta-agent** | Zabudovaný systémový agent "Agent Builder". Chatuje s userom, výsledkom je novovytvorený agent. |

## Čo **nie je** v scope (MVP)

- Multi-machine execution / horizontal scaling runnerov
- Marketplace agentov či MCP serverov
- Verzie modelov fine-tune
- Billing / usage quotas (len tracking nákladov, nie enforcement)

## Princípy

1. **Transparencia behu** — user vidí každý prompt, každý tool call, každú response. Bez black boxov.
2. **Bezpečnosť credentials** — nikdy plaintext v DB, vždy šifrované. OAuth tokens refreshujeme automaticky.
3. **Replayable runs** — run je plne rekonštruovateľný z `execution_events`.
4. **Provider-agnostic** — nie sme pribití k jednému LLM vendorovi; od začiatku multi-provider.
5. **Minimálne MVP** — najprv 1 stroj, 1 worker, žiadny K8s. Scale až keď je dôvod.
