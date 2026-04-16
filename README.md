# agentx

Platforma na tvorbu a exekúciu AI agentov. Prihlásiš sa cez web UI, vytvoríš agenta (sám, alebo cez meta-agenta ktorý sa ťa na všetko opýta), priradíš mu MCP nástroje a spúšťaš ho cez HTTP webhook, chat v admin UI alebo cron.

## Stav

Projekt je vo **fáze dokumentácie** — kód ešte nie je. Celý zámer, architektúra a tech voľby sú rozpísané v `docs/`.

## Ako začať čítať

Odporúčaný postup:

1. [`docs/00-overview.md`](./docs/00-overview.md) — vízia, use-cases, slovník pojmov
2. [`docs/01-architecture.md`](./docs/01-architecture.md) — ako to všetko do seba zapadá
3. [`docs/02-tech-stack.md`](./docs/02-tech-stack.md) — prečo tieto technológie
4. [`docs/14-ui-wireframes.md`](./docs/14-ui-wireframes.md) — ako vyzerá UI
5. [`docs/12-roadmap.md`](./docs/12-roadmap.md) — fázovanie
6. [`docs/16-development-workflow.md`](./docs/16-development-workflow.md) — ako rozbehnúť a pracovať

Ďalšie dokumenty (00-30) pokrývajú: data model, runtime, MCP, triggery, sandbox, observability, auth, meta-agent, API spec, UX guidelines, env config, testing, code patterns, evals, context management, safety, prompt caching, structured output, file handling, cost governance, concurrency, RAG, analytics.

UI inšpirácia: `docs/wonderful/` — screenshoty ktoré sa nám páčia layout/UX-wise. Vizuálne zachovávame shadcn default.

## Kontakt

Majiteľ projektu: tomasmajer@gmail.com
