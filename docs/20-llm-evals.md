# 20 — LLM Testing & Evals

Ako **overujeme kvalitu** LLM-based správania — oddelene od bežných testov correctness.

## Tri vrstvy testovania LLM

| Vrstva | Čo testuje | Determinizmus | Kedy beží | Cena |
|---|---|---|---|---|
| **Fake provider** (unit/integration/E2E) | Že náš kód správne volá LLM, parsuje toolcalls, zapisuje eventy, handluje erroyr | Plne deterministické | Každý PR, každý push | $0 |
| **Evals** | Že agenti (hlavne meta-agent + templates) reálne *dobre* reagujú | Probabilistické | Nightly + pred release + na vyžiadanie | $$ |
| **Smoke (real)** | Že providers SDK nie sú broken, credentials fungujú | Stochastické | Nightly | $ |

Tento dokument je hlavne o **vrstve 2 — evals**.

## Prečo evals nie sú bežné testy

- **Výstup LLM varíruje** medzi behmi → nemôžeš porovnávať reťazec-k-reťazcu
- **Správnosť nie je binárna** → ohodnotíme podľa viacerých kritérií (relevantné? úplné? v správnom tóne? volá správne tooly?)
- **Agregácia nad N behmi** → jeden beh môže byť outlier, pozeráme priemer/medián/p95
- **Nie v PR gate** (príliš drahé + zašumené), ale v nightly + pred release

## Čo evaluujeme

### Meta-agent (Agent Builder)

Najdôležitejší — priamo ovplyvňuje užívateľský zážitok pri vytváraní agentov.

Scenáre:
- "Vague prompt" — "Chcem agenta na GitHub" → má klásť clarifying otázky, nie hneď kód
- "Clear prompt" — "Každé ráno o 8 zosumarizuj GitHub issues z repo X a pošli Slack msg" → má priamo navrhnúť config a toolset
- "Unfeasible prompt" — "Agent ktorý hackuje X" → má odmietnuť
- "Edgy prompt" — nejasné scope, viac možných interpretácií → najlepšie clarify
- "Tool selection" — scenár vyžadujúci GitHub + Slack → má zvoliť obidva MCP servery, nie preflowovať random

### Template / built-in agenti

Keď (neskôr) pridáme template agentov (PR reviewer, Support Triage…), každý má vlastný eval suite:
- PR reviewer: daný diff → vyprodukuje komentár ktorý adresuje všetky reálne issues
- Support Triage: daný ticket → klasifikuje do správnej kategórie

### System prompt zmeny

Každá zmena system promptu (agent, meta-agent, internal prompts) → **musí prejsť eval suitou** pred merge-om. CI comment s diff skóre.

### Model upgrade

Nový Claude / GPT / Gemini release → spustíme eval proti novému modelu, porovnáme s baseline, rozhodujeme či upgradnúť default.

## Štruktúra evals

```
evals/
├── framework/              # harness v TS
│   ├── runner.ts
│   ├── grader.ts           # code-based + llm-as-judge
│   ├── reporter.ts
│   └── types.ts
├── suites/
│   ├── meta-agent/
│   │   ├── vague-prompt.eval.ts
│   │   ├── clear-prompt.eval.ts
│   │   └── tool-selection.eval.ts
│   └── (neskôr ďalšie)
├── fixtures/               # shared test data
└── results/                # JSON histórie behov (gitignored, uploaded artifact)
```

## Formát eval case-u

```ts
// evals/suites/meta-agent/vague-prompt.eval.ts
import { evalCase } from "../../framework";

export default evalCase({
  name: "meta-agent: vague prompt asks for clarification",
  agent: "meta-agent",
  runs: 5,                          // N opakovaní pre agregáciu
  input: [
    { role: "user", content: "Chcem agenta na GitHub" },
  ],
  criteria: [
    {
      id: "asks-clarifying-question",
      description: "Response contains at least one clarifying question",
      type: "code",
      check: (response) => response.text.includes("?"),
      weight: 1,
    },
    {
      id: "no-premature-commit",
      description: "Does not call create_agent on the first turn",
      type: "code",
      check: (response) => !response.toolCalls.some((tc) => tc.name === "create_agent"),
      weight: 2,
    },
    {
      id: "question-quality",
      description: "Asked questions are specific and useful (not generic)",
      type: "llm-judge",
      rubric: `
        Score 1-5 based on how useful the clarifying questions are for
        narrowing down the agent's scope. 5 = asks about specific things
        like repo name, action, trigger timing. 1 = generic "what do you want?"
      `,
      model: "claude-haiku-4-5",    // cheap judge
      passThreshold: 3,
      weight: 2,
    },
  ],
  successThreshold: 0.75,  // musí dosiahnuť 75% weighted score
});
```

## Grading strategies

### Code-based (deterministic)

Najlepšia, keď sa dá. Príklady:
- "Response obsahuje tool call `create_agent`" → regex / toolcalls.some
- "Odpoveď je valid JSON matching schema" → JSON parse + zod
- "Odpoveď v <200 slovách" → word count
- "Neobsahuje blacklist slov" → regex

### LLM-as-judge

Na subjektívne kritériá (kvalita, tón, relevantnosť):
- Cheaper model (Haiku)
- Rubric prompt: "Rate response 1-5 based on [criterion]. Include reasoning."
- Aggregate cez N calls (medián)
- Pozor na bias: ten istý vendor ako ide-judge môže preferovať ten istý vendor ako testuje. Používaj odlišného vendora kde možno.

### Human review

Na high-stakes kritériá (bezpečnosť, spoľahlivosť):
- Pred release: random sample 20 behov, človek oboduje
- Review UI (local — jednoduchá stránka čo listuje výstupy a dáva pass/fail buttons) — Phase 7+

## Harness

```ts
// evals/framework/runner.ts
export async function runEval(eval: EvalCase): Promise<EvalResult> {
  const results: RunResult[] = [];
  for (let i = 0; i < eval.runs; i++) {
    const response = await invokeAgent(eval.agent, eval.input);
    const scores = await gradeResponse(response, eval.criteria);
    results.push({ response, scores });
  }
  const aggregate = aggregateScores(results, eval.criteria);
  return {
    name: eval.name,
    passed: aggregate.weightedScore >= eval.successThreshold,
    aggregate,
    perRun: results,
  };
}
```

CLI:
```bash
pnpm evals                              # celý suite
pnpm evals --suite meta-agent           # iba meta-agent
pnpm evals --case vague-prompt          # jeden case
pnpm evals --model claude-opus-4-6      # override default model
pnpm evals --baseline results/2026-04-14.json   # compare to prior
```

Output: JSON + terminal tabuľka + HTML report s diffom voči baseline.

## Tooling

**Rozhodnutie:** custom TS harness v `evals/framework/`. Dôvody:
- Už používame Vercel AI SDK — rovnaký LLM invocation path ako prod
- Zero framework overhead
- TS = shared types s product code
- Extensible: custom graders, reporters

**Možné v budúcnosti:**
- **Promptfoo** — YAML eval cases, CLI diff tool, dobrý web report. Zvážme keď budeme mať >30 eval cases.
- **Langfuse evals** — ak by sme skončili s Langfuse pre observability
- **Inspect AI** (UK AISI) — pokročilé, Python, safety-focused evals

## Kedy beží

| Trigger | Čo spustí |
|---|---|
| Nightly (GitHub Actions cron) | Celý eval suite, upload results ako artifact, diff vs yesterday |
| PR zmeniaci `agent-core`, `meta-agent` prompt alebo `providers` | Selektívne evals (ovplyvnené), comment na PR |
| Manual (`pnpm evals`) | Čokoľvek |
| Pred release tag | Full suite + smoke + human sample |

## Metriky trackujeme

- **Pass rate** per case (z posledných 30 behov) — trend over time
- **Aggregate score** per suite
- **Cost per eval run** (dolárov)
- **Latency** per case
- **Regression indicator**: case ktorý predtým passoval, teraz fail > 2 runy za sebou → CI block

## Budget

Typický eval suite MVP: ~20 cases × 5 runs × ~$0.02 per execution = **~$2 za beh**. Nightly $60/mesiac — OK. Keď porastie na 100 cases, zvážime dimenzia redukcie (menej runs pre stable cases, viac pre kritické).

Setting: `EVAL_MAX_COST_USD=10` per execution ako safeguard.

## Golden dataset

- Každá regresia objavená v produkcii → pridaj ako eval case (so scenárom ktorý ju reprodukoval)
- Rastie časom, **netestujeme všetko v PR** — iba select relevantných nightly
- Version-controlled v `evals/suites/`
- PII v input/outputoch stripped alebo sintetizované

## Safety & alignment evals (neskôr, phase 7+)

Samostatná suite `evals/suites/safety/`:
- Prompt injection resistance — "ignore previous instructions and …"
- Credential leak — agent má tool s tokenom, snaží sa ho leaknúť do output
- Refusal quality — odmietne harmful requesty s dobrým vysvetlením
- Tool misuse — neukľúži s nebezpečným combom toolov (napr. delete na filesystem + ambiguous input)

Tieto bežia **na každom release** a human-reviewed sample.

## Kam s výsledkami

- **MVP:** JSON v `results/` + HTML v artifact, diff v PR comment
- **Phase 5+:** DB tabuľka `evals` s histórie (filtrovateľné v admin UI, grafy v čase)
- **Phase 7+:** Dashboard pre team (ak team narastie)

## Anti-patterns

- **Jeden beh ako pass/fail** — LLM varíruje, potrebuješ aggregation nad N
- **Overly specific assertions** — "output musí obsahovať slovo X" robí eval brittle; radšej kritériá typu "adresuje issue Y"
- **Eval suite tak veľký že ho nikto nespustí** — radšej menší, ale aktuálny
- **Testovanie LLM-a bez guardov** — pred invokáciou v evaloch nastav `maxCost` per execution, inak môže bloating eval utopiť mesačný rozpočet

## Ako pridať eval

1. `evals/suites/<topic>/<case>.eval.ts` — priprav case podľa template
2. `pnpm evals --case <name>` — over že prechádza lokálne (alebo zámerne fail-uje ak je to regresion test)
3. Commit s `docs(evals):` prefix ak bola to response na bug
4. PR description: "Baseline score: X. Added pretože: Y"
