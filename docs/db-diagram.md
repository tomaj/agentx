# Database Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        IDENTITY & ACCESS                                     │
│                                                                                              │
│  ┌──────────┐      ┌──────────────┐      ┌──────────┐                                       │
│  │  users    │──M:N─│ org_members   │──M:N─│  orgs    │                                       │
│  └──────────┘      └──────────────┘      └──────────┘                                       │
│       │                                       │                                              │
│       │ owns                                  │ owns                                         │
│       ▼                                       ▼                                              │
│  ┌──────────────┐                       ┌──────────────┐                                     │
│  │mcp_credentials│                       │ org_secrets  │                                     │
│  └──────────────┘                       └──────────────┘                                     │
│       ▲                                                                                      │
│       │ references                                                                           │
│  ┌──────────────┐                                                                            │
│  │ mcp_servers   │  (global katalóg)                                                         │
│  └──────────────┘                                                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     AGENT DEFINITION                                         │
│                                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐                         │
│  │  agents  (versioned immutable rows)                             │                         │
│  │                                                                 │                         │
│  │  agent_id (logical) ──── version ──── is_current                │                         │
│  │  system_prompt, model, params                                   │                         │
│  │  mcp_bindings: JSONB [{mcpServerId, credentialId, tools}]       │                         │
│  │  params.skillIds: JSONB [uuid, ...]                             │                         │
│  └───────┬──────────┬──────────┬──────────┬───────────┬───────────┘                         │
│          │          │          │          │           │                                       │
│          ▼          ▼          ▼          ▼           ▼                                       │
│   ┌──────────┐ ┌─────────┐ ┌────────┐ ┌───────────┐ ┌──────────────┐                       │
│   │ triggers │ │  chat   │ │  tag   │ │  custom   │ │ agent_issues │                       │
│   │          │ │sessions │ │  defs  │ │  tools    │ │              │                       │
│   └────┬─────┘ └────┬────┘ └────────┘ │(versioned)│ └──────────────┘                       │
│        │            │                  └───────────┘                                         │
│        ▼            ▼                                                                        │
│   ┌──────────┐ ┌──────────┐                                                                 │
│   │ api_keys │ │ messages │       ┌──────────────┐      ┌──────────────┐                    │
│   └──────────┘ └──────────┘       │ agent_files  │─1:N─▶│ file_chunks  │                    │
│                                   │              │      │  (pgvector)  │                    │
│                                   └──────────────┘      └──────────────┘                    │
│                                                                                              │
│                                   ┌──────────────┐                                           │
│                                   │ agent_skills │  (reusable, shared across agents)         │
│                                   └──────────────┘                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      EXECUTION                                               │
│                                                                                              │
│  ┌──────────────────────────────────────────────────────────┐                                │
│  │  executions                                               │                                │
│  │                                                           │                                │
│  │  agent_snapshot_id ──FK──▶ agents.id (immutable version)  │                                │
│  │  trigger_id, session_id, initiated_by                     │                                │
│  │  status, input, output, cost, tokens                      │                                │
│  └─────┬──────────┬──────────────┬──────────────┬───────────┘                                │
│        │          │              │              │                                             │
│        ▼          ▼              ▼              ▼                                             │
│  ┌───────────┐ ┌───────────┐ ┌────────────┐ ┌───────────────────┐                           │
│  │ execution │ │ execution │ │ execution  │ │ policy_violations │                           │
│  │  _events  │ │  _tags    │ │ _scoring   │ │                   │                           │
│  │           │ │           │ │            │ │  policy_id ──FK──▶│governance_policies         │
│  │  seq,type │ │  tag_id ─▶│ sentiment,  │ └───────────────────┘                           │
│  │  payload  │ │  tag_defs │ │ quality,   │                                                  │
│  └───────────┘ └───────────┘ │ summary    │                                                  │
│                              └────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 GOVERNANCE & ANALYTICS                                       │
│                                                                                              │
│  ┌─────────────────────┐     ┌─────────────────┐     ┌──────────────┐                       │
│  │governance_policies  │     │ custom_metrics   │     │   channels   │                       │
│  │                     │     │                  │     │              │                       │
│  │ org-scoped          │     │ tag-based rules  │     │ slack/email/ │                       │
│  │ condition, action   │     │ per agent        │     │ whatsapp     │                       │
│  └─────────────────────┘     └────────┬─────────┘     └──────────────┘                       │
│                                       │                                                      │
│                                       ▼                                                      │
│  ┌─────────────────────┐     ┌─────────────────┐                                            │
│  │ daily_agent_costs   │     │    alerts        │                                            │
│  │                     │     │                  │                                            │
│  │ agent_id + date     │     │ metric_id, cond  │                                            │
│  │ (cost governance)   │     │ severity, notify │                                            │
│  └─────────────────────┘     └────────┬─────────┘                                            │
│                                       │                                                      │
│                                       ▼                                                      │
│  ┌─────────────────────┐     ┌─────────────────┐                                            │
│  │    audit_log        │     │  alert_events   │                                            │
│  │                     │     │                  │                                            │
│  │ actor, action,      │     │ triggered_at,    │                                            │
│  │ entity, metadata    │     │ metric_value     │                                            │
│  └─────────────────────┘     └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════
                    RELATIONSHIP SUMMARY
═══════════════════════════════════════════════════════════════

users ─────M:N──── orgs                     (cez org_members, s rolou)
users ─────1:N──── mcp_credentials          (owner_type=user)
orgs ──────1:N──── mcp_credentials          (owner_type=org)
orgs ──────1:N──── org_secrets
orgs ──────1:N──── governance_policies
orgs ──────1:N──── channels
orgs ──────1:N──── agents (via agent_id)

agents ────1:N──── agents                   (self-ref: agent_id groups versions)
agents ────1:N──── triggers
agents ────1:N──── chat_sessions
agents ────1:N──── tag_definitions
agents ────1:N──── custom_tools
agents ────1:N──── agent_files
agents ────1:N──── agent_issues
agents ────N:M──── agent_skills             (via params.skillIds JSONB)
agents ────N:M──── mcp_servers              (via mcp_bindings JSONB)
agents ────N:M──── mcp_credentials          (via mcp_bindings JSONB)

triggers ──1:N──── api_keys
chat_sessions ─1:N── messages

executions ─FK──── agents.id               (snapshot = konkrétna verzia)
executions ─FK──── triggers                 (nullable)
executions ─FK──── chat_sessions            (nullable, pre chat trigger)
executions ─FK──── users                    (initiated_by, nullable)
executions ─1:N──── execution_events
executions ─1:N──── execution_tags
executions ─1:1──── execution_scoring
executions ─1:N──── policy_violations
executions ─0:N──── agent_issues            (optional link)

execution_tags ─FK── tag_definitions
policy_violations ─FK── governance_policies

agent_files ──1:N── file_chunks

custom_metrics ─1:N── alerts
alerts ────────1:N── alert_events

mcp_servers (standalone katalóg, žiadne FK smerom von)
audit_log   (standalone, FK len na users nullable)
daily_agent_costs (standalone, denormalized)


═══════════════════════════════════════════════════════════════
                     TABLE COUNT BY PHASE
═══════════════════════════════════════════════════════════════

Phase 0-1 (MVP):     users, orgs, org_members, agents, mcp_servers,
                     mcp_credentials, triggers, api_keys, chat_sessions,
                     messages, executions, execution_events,
                     daily_agent_costs, audit_log
                     ──── 14 tabuliek

Phase 2 (RAG):       agent_files, file_chunks
                     ──── +2 = 16

Phase 3 (Tags/Tools): tag_definitions, execution_tags, custom_tools,
                      org_secrets
                     ──── +4 = 20

Phase 5 (Security):  governance_policies, policy_violations,
                     agent_issues, execution_scoring
                     ──── +4 = 24

Phase 6 (Channels):  agent_skills, channels
                     ──── +2 = 26

Phase 7 (Analytics): custom_metrics, alerts, alert_events
                     ──── +3 = 29

TOTAL:               29 tabuliek
```
