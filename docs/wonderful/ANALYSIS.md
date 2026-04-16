# Wonderful Platform Analysis — Feature Gap vs agentx

Analýza 38 screenshotov z platformy Wonderful (AI agent builder). Pre každú feature: čo robia, či to máme, a čo treba pridať.

## Screenshot index

| # | Súbor | Čo zobrazuje |
|---|---|---|
| 01 | `activities-conversation-log-table` | Activities page: tabuľka konverzácií s dátumom, userom, trvaním, agentom, smerom, typom (voice/chat), kto ukončil, status. Bookmarks, filtre, search, export CSV, columns mgmt, paginacia (705 aktivít) |
| 02 | `agent-editor-base-prompt-sections` | Agent Editor > Instructions > Base Prompt: kolapsovateľné sekcie (Overview, Core Attributes, Understanding Input, Writing Output, Conversation Flow, Current Session Info). View Channels toggle. |
| 03 | `agent-editor-skills-tools-list` | Agent Editor > Skills > Tools tab: vlastné code-based tools (switch_language, confirm_and_send_sms, search_exam_appointments...). Manage Tools + New Tool. |
| 04 | `agent-editor-tools-with-voice-player` | Rovnaký tools view + audio/video player overlay (test agenta cez voice call) |
| 05 | `agent-builder-session-settings-modal` | Agent Builder session: modal s Model selector, Audience Mode, Enable Web Search, Token Usage (8%), "Faster" toggle |
| 06 | `agent-builder-landing-suggested-prompts` | Agent Builder landing: "What do you want to build today?" + suggested prompts + past sessions |
| 07 | `agent-builder-chat-reviewing-agent` | Agent Builder chat: review existujúceho agenta, tool execution inline |
| 08 | `agent-builder-analyzing-interactions` | Agent Builder: loading 8+ production interactions, checking tool implementations |
| 09 | `agent-builder-overview-card-flow-tools` | Agent overview card: Type, Locale, Interactions count. Tabs: What it does / Issues found / Proposed Fixes. Conversation flow (6 steps), Tools (7) |
| 10 | `agent-builder-issues-found-by-severity` | Issues found: kategorizované High/Medium/Low. "Inconsistent greeting", "get_family_members called too late", "OTP 6-digit vs 4-digit" |
| 11 | `agent-builder-issues-summary-proposed-fixes` | Summary 7 issues + "9 Changes" button s Review action |
| 12 | `agent-builder-evaluation-run-chat-test` | Test/eval po zmenách: simulovaný chat, "Evaluated Agent", "Run 2/3 Evaluations" |
| 13 | `agent-builder-eval-results-code-diff` | Evaluation: 3/5 tests pass, code diff pre tool updates |
| 14 | `agent-builder-behavioral-notes-edge-cases` | Agent Builder notes: edge case analýza, user inline corrections |
| 15 | `issues-tracker-table-categories-severity` | Issues page: tabuľka s Description, Category (Wrong Answer, Transcription, Flow Logic), Assignee, Status, Severity |
| 16 | `agent-builder-knowledge-visualization` | Agent Builder: generating capabilities visualization |
| 17 | `agent-builder-conversation-flow-diagram` | Conversation flow diagram: Mermaid-style vizualizácia celého agent flow (Plan Inquiry, Billing, Upgrade...) s krokmi. Links: "Show prompt", "Run test", "Chat with agent" |
| 18 | `metrics-editor-tag-rules-chart-preview` | Metrics editor: "Verified User" metric. Rule groups: Has/Not + Tag conditions. Bar+line chart preview over time |
| 19 | `metrics-list-all-custom-metrics` | All Metrics list: Positive Contained Interaction, Valid Interaction, Contained Interaction, Verified User |
| 20 | `agent-builder-auto-generated-tags` | Auto-generated Tags: "Plan Inquiry", "Phone Number Lookup", "Customer Dispute" — each with generated prompt |
| 21 | `review-update-prompt-diff-view` | Review & Update: side-by-side prompt diff (current vs proposed), tabs: Instructions, Tags & Metrics, Settings, Evaluations |
| 22 | `review-update-evaluations-voice-test` | Review & Update > Evaluations tab: test scenario s audio playback |
| 23 | `agent-builder-creating-alert-metrics` | Agent Builder: creating alert metrics (OTP Success Rate, Compliance). Setting up severity-based email routing |
| 24 | `agent-config-voice-multilingual-locales` | Agent Configuration: Voice settings, multilingual mode, locale selection, custom voice |
| 25 | `command-palette-global-search` | Command palette (Cmd+K): Home, Agent, Activities, Agents, Issues, Governance, Alerts, Campaigns, Metrics |
| 26 | `activity-detail-transcript-tool-calls` | Activity slide-out: call transcript s inline tool calls, sentiment (Happy), score (100), duration |
| 27 | `agent-editor-full-sidebar-structure` | Agent Editor sidebar: Build (Instructions/Base Prompt/Summary/Tags → Skills → Tools → Knowledge), Analyze (Tags, Metrics), Evaluate (Scenarios, Batches, History) |
| 28 | `tool-code-editor-ide-with-ai-assist` | Tool Code Editor: full IDE, JS function, Input/Output/Traces/Errors/HTTP tabs, Run, Version History, AI assistant chat |
| 29 | `mcp-catalog-grid-connections` | MCP Settings: grid s Atlassian, HubSpot, Linear, MS 365, Dynamics, Learn, Notion, Salesforce, ServiceNow, Snowflake, Zendesk |
| 30 | `scenario-builder-visual-flow-editor` | Scenario builder: visual flow editor pre eval. Turn-by-turn nodes, custom judge prompt, + Agent Message / + Agent Tool / + User Message |
| 31 | `agent-builder-loading-production-data` | Agent Builder: loading production data, 30 tools executed |
| 32 | `agent-builder-overview-623-interactions` | Overview card: 623+ interactions, Voice & Chat, Conversation flow steps, key capabilities |
| 33 | `agent-builder-825-interactions-analysis` | Analysis: 825+ production interactions, offering dive deeper / run evals / chat |
| 34 | `governance-policy-editor-financial-fraud` | Governance: Edit Policy "Financial Fraud" modal — condition text, max hits, speaker filter, action, version history |
| 35 | `governance-policies-table-all` | Governance policies table: Animals, Financial Fraud, Harassment, Impersonation, Offensive Language, Privacy Violation, Sexual Language, System Manipulation, Trolling, Unsafe Content... |
| 36 | `quality-management-scorecard-dashboard` | Quality Management: per-rep scorecards, CSAT, call volume, badges, team breakdown |
| 37 | `activities-webhook-task-running-timeline` | Activities: webhook-triggered task "AML Alert Triage" running with step-by-step timeline |
| 38 | `settings-channels-integrations-sidebar` | Settings > Channels: Slack, Email, Outlook, WhatsApp. Full sidebar: User Profile, Email, Channels, MCP, Telephony, Users, Service Accounts, Groups, Roles, Authentication, Audit Log, Data Governance, Secrets, Global Variables, Storage, Billing & Usage, Experiments, API Docs |

---

## Feature gap analýza

### NEMÁME a TREBA pridať (high priority)

#### 1. Tags system
**Wonderful:** Auto-generované tagy per execution (screenshots 18, 19, 20). Agent Builder vie navrhnúť tagy + ich prompt definície. Tagy sa potom používajú v metrikách.
**agentx stav:** Žiadna tagová funkcionalita.
**Čo pridať:**
- `execution_tags` tabuľka: `execution_id`, `tag_name`, `confidence`, `source` (auto/manual)
- Auto-tagging cez LLM post-processing (po execution_completed, lacný Haiku call)
- Per-agent definícia tag set-u s prompt (kedy sa tag aplikuje)
- UI: filter executions podľa tags, tag management v agent editore
- **Phase:** 3 (Triggery) — tagy sú prerequisite pre zmysluplné metriky

#### 2. Custom metrics s tag-based rules
**Wonderful:** Metrics editor (screenshots 18, 19) — definuješ metriku ako "Has tag X AND NOT tag Y", vidíš graf overtime.
**agentx stav:** `30-analytics.md` má len základné metriky (cost, duration, success rate). Žiadne custom.
**Čo pridať:**
- `custom_metrics` tabuľka: `agent_id`, `name`, `description`, `rules` (JSONB — tag-based boolean logic)
- Materialized view refresh s custom metric calculation
- UI: metric editor s drag-drop rule builder + chart preview
- **Phase:** 7 (Analytics) — závisí od tags

#### 3. Governance / Content policies (rozšírenie safety)
**Wonderful:** Policies table (screenshots 34, 35) — Financial Fraud, Harassment, Impersonation, Privacy Violation... Každá s condition text, max hits, speaker filter, action.
**agentx stav:** `23-agent-safety.md` má koncept, ale nie ako konfigurovateľné DB entity.
**Čo pridať:**
- `governance_policies` tabuľka: `org_id`, `name`, `condition`, `max_hits`, `action` (flag/block/alert), `enabled`
- Runtime: po každej LLM response check policies (regex + keyword match; neskôr LLM-based)
- UI: CRUD pre policies, version history
- Export CSV
- **Phase:** 5 (Security hardening)

#### 4. Scenario-based evaluation builder (vizuálny)
**Wonderful:** Visual flow editor (screenshot 30) — turn-by-turn scenáre s expected messages, tool calls, custom judge prompts. Batch execution.
**agentx stav:** `20-llm-evals.md` má code-based eval harness, ale žiadny vizuálny builder.
**Čo pridať:**
- UI: drag-and-drop scenario builder (nodes: user message → expected agent response → expected tool call)
- Custom judge prompt per turn
- "Save and Run" s batch execution cez eval framework
- Scenario library per agent
- **Phase:** 4 (Meta-agent + evals)

#### 5. Agent review flow (Draft → Review & Update)
**Wonderful:** Side-by-side prompt diff, evaluation results, then "Update Agent" button (screenshots 21, 22).
**agentx stav:** Máme agent versioning (immutable rows), ale UI nemá review/diff flow.
**Čo pridať:**
- UI: pri editácii agenta → "Save as Draft" (nový riadok, `is_current=false`, `status=draft`)
- Review mode: side-by-side diff current vs draft (system prompt, params, bindings)
- "Run eval against draft" button → eval results inline
- "Publish" → `is_current` swap
- **Phase:** 4 (s eval framework)

#### 6. Issues / bug tracker pre agentov
**Wonderful:** Built-in issues table (screenshot 15) — Category, Assignee, Severity, linked to interactions.
**agentx stav:** Žiadny issue tracking.
**Čo pridať:**
- `agent_issues` tabuľka: `agent_id`, `execution_id` (optional), `title`, `description`, `category`, `severity`, `status`, `assignee_id`
- Auto-create issue pri failed execution (optional)
- Agent Builder vie analyzovať issues + propose fix
- UI: issues list per agent, link na execution timeline
- **Phase:** 5

#### 7. Channels (Slack, Email, WhatsApp)
**Wonderful:** Multi-channel delivery (screenshot 38) — Slack, Email, Outlook, WhatsApp ako first-class.
**agentx stav:** Triggery sú HTTP/chat/cron. Output je len v UI alebo webhook response. Žiadny Slack/email channel.
**Čo pridať:**
- `channels` koncept: Slack (bot), Email (SMTP/SendGrid), WhatsApp (Twilio)
- Per-agent channel config: "respond via Slack DM" / "send email to X"
- Channel MCP servery (slack, gmail sú už v katalógu) — ale ide o **inbound** channels (agent reaguje na Slack message, nie len posiela)
- **Phase:** 6+

#### 8. Tool Code Editor (custom inline tools)
**Wonderful:** Full IDE (screenshot 28) — JS code, input/output testing, traces, version history, AI assistant.
**agentx stav:** Tooly sú cez MCP servery (externé). Žiadny inline code tool editor.
**Čo pridať:**
- "Custom Tool" typ: user píše JS/TS funkciu v editore
- Executuje sa v sandbox (Docker), isolated od MCP
- Input/output schema (Zod), test run s mock dátami
- Version history per tool
- Monaco editor v UI + AI code assistant (Claude)
- **Phase:** 3+ (po základnom tool systéme)

### NEMÁME ale NIŽŠIA PRIORITA

#### 9. Conversation flow visualization
**Wonderful:** Mermaid-style diagram (screenshot 17) generovaný z agent configu.
**agentx stav:** Žiadna vizualizácia flow.
**Čo pridať:** Agent Builder vie vygenerovať flow diagram z system promptu. Render cez mermaid.js v UI. Read-only visualization.
**Phase:** 4+ (Agent Builder feature)

#### 10. Agent Builder production analysis
**Wonderful:** Builder načíta 825+ reálnych interakcií, nájde issues, navrhne fix (screenshots 8, 9, 10, 31-33).
**agentx stav:** Agent Builder vie vytvoriť agenta, ale neanalyzuje production data.
**Čo pridať:** Internal tool `analyze_production_executions(agentId, limit)` — načíta posledných N execution_events, agreguje patterns, nájde failures. Builder potom navrhne zmeny.
**Phase:** 7+ (vyžaduje dosť execution history)

#### 11. Sentiment & quality scoring per execution
**Wonderful:** Každá konverzácia má sentiment (Happy/Sad/Neutral) + numerické score (screenshot 26).
**agentx stav:** Máme len status (succeeded/failed) a cost.
**Čo pridať:** Post-execution LLM call (Haiku) na scoring: `{ sentiment, qualityScore, summary }`. Uložiť do `executions` alebo `execution_scoring` tabuľky.
**Phase:** 5

#### 12. Global Variables / Secrets UI
**Wonderful:** Platform-level secrets a variables cez UI (screenshot 38 sidebar).
**agentx stav:** Secrets sú len v env variables. Žiadny UI management.
**Čo pridať:** `secrets` tabuľka (org-scoped), encrypted. UI na CRUD. Injektovateľné do agent params alebo MCP configs. Oddelené od MCP credentials.
**Phase:** 3

#### 13. Agent Skills (hierarchická kompozícia)
**Wonderful:** Agenty majú Skills (screenshot 27) — sub-komponenty s vlastnými tools a instructions.
**agentx stav:** Flat agent model — jeden system prompt, jeden set bindings.
**Čo pridať:** Skills = pod-agenti alebo prompt moduly. Agent referencuje N skills, každý prináša tools + prompt fragment. Umožňuje reuse (napr. "authentication skill" zdieľaný medzi agentmi).
**Phase:** 6+ (po stabilnom MVP)

#### 14. Alerts system
**Wonderful:** Metric-based alerting s severity routing (screenshot 23).
**agentx stav:** `30-analytics.md` spomína alerting ako Phase 7.
**Phase:** 7 (závisí od metrics)

### MÁME POKRYTÉ (partial alebo full)

| Feature | Wonderful | agentx stav |
|---|---|---|
| Activities/execution log | Screenshot 01, 37 | `execution_events` + executions list UI (14-ui-wireframes.md) |
| Base prompt editor | Screenshot 02, 27 | Agent editor wireframe (14) |
| MCP catalog | Screenshot 29 | `06-mcp-integration.md` + UI wireframe |
| Agent Builder (create via chat) | Screenshots 06, 07 | `11-meta-agent.md` |
| Command palette | Screenshot 25 | `15-ux-guidelines.md` (Cmd+K) |
| Execution timeline | Screenshot 37 | `execution_events` + live viewer (09-observability.md) |
| LLM evals | Screenshots 12, 13 | `20-llm-evals.md` (code-based + LLM judge) |
| Cost tracking | Implicit | `27-cost-governance.md` (3-tier budgets) |
| Safety guardrails | Screenshots 34, 35 | `23-agent-safety.md` (prompt injection, tool tiers) |
| Knowledge/RAG | Screenshot 27 sidebar | `29-rag-knowledge-base.md` + `26-file-handling.md` |
| Export CSV | Screenshots 01, 35 | `30-analytics.md` mentions CSV export |

### MIMO SCOPE (Wonderful-specific, nie pre agentx)

| Feature | Prečo skip |
|---|---|
| Voice/Telephony | agentx je text-first platforma |
| Quality Management scorecards (screenshot 36) | Call-center specific; naša verzia sú agent analytics |
| Campaigns (outbound) | Nie náš use-case |
| Multilingual voice detection (screenshot 24) | Text agenti — multilingual cez prompt, nie voice detection |

---

## Prioritizovaný akčný plán

### Do ROADMAP pridať:

**Phase 3 (Triggery):**
- Tags system (auto + manual)
- Custom inline tools (code editor)
- Global variables/secrets UI

**Phase 4 (Meta-agent + evals):**
- Scenario builder UI (vizuálny)
- Agent review flow (Draft → Diff → Eval → Publish)
- Conversation flow visualization

**Phase 5 (Security):**
- Governance policies (DB entity, CRUD, runtime check)
- Issues tracker per agent
- Sentiment + quality scoring per execution

**Phase 7 (Analytics):**
- Custom metrics s tag-based rules
- Alerts system (metric-based, severity routing)
- Agent Builder production analysis

**Phase 6+ (Future):**
- Channels (Slack, Email, WhatsApp inbound)
- Agent Skills (hierarchická kompozícia)
