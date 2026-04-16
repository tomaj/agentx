# 14 — UI Wireframes

ASCII skice pre kľúčové obrazovky. Nie pixel-perfect — ide o layout, informačnú hierarchiu a interaction patterns. Konkrétny vizuálny dizajn = shadcn defaults (viď `15-ux-guidelines.md`).

Všetky obrazovky (okrem `/login`) bežia vo **App Shell**.

## App Shell

Sidebar naľavo (collapsible), topbar hore, content napravo.

```
┌─ agentx ─────────────────────────────────────────────────────────────────┐
│ ┌────────────────┐ ┌────────────────────────────────────────────────────┐│
│ │ Acme Inc    ▼  │ │  Agents                        [⌘K] [🔔] [tomaj ▼]││
│ │ ──────────────  │ ├────────────────────────────────────────────────────┤│
│ │ ▸ Agents       │ │                                                    ││
│ │ ▸ Executions         │ │                 <page content>                     ││
│ │ ▸ Chat         │ │                                                    ││
│ │ ▸ MCP          │ │                                                    ││
│ │   · Catalog    │ │                                                    ││
│ │   · Credentials│ │                                                    ││
│ │ ▸ API Keys     │ │                                                    ││
│ │ ─────────────  │ │                                                    ││
│ │ ▸ Settings     │ │                                                    ││
│ │   · Org        │ │                                                    ││
│ │   · Members    │ │                                                    ││
│ │   · Profile    │ │                                                    ││
│ └────────────────┘ └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

**Detaily:**
- **Org switcher** v sidebar top (dropdown, zoznam orgs kde som member + "Create organization")
- **⌘K** = command palette (globálny search, quick actions — "Create agent", "Go to executions", …)
- Bell = notifications (run completed, OAuth token expiring…)
- User menu = profil, settings, logout
- Sidebar collapse na `<1200px` na rail-only (ikony)
- Dark mode toggle v user menu (default = system)

## /login

```
┌──────────────────────────────────────────────────┐
│                                                  │
│                   agentx                         │
│                                                  │
│         ┌──────────────────────────┐             │
│         │  Email                    │            │
│         │  ┌──────────────────────┐│            │
│         │  │ you@example.com      ││            │
│         │  └──────────────────────┘│            │
│         │                          │             │
│         │  Password                │             │
│         │  ┌──────────────────────┐│            │
│         │  │ ••••••••             ││            │
│         │  └──────────────────────┘│            │
│         │                          │             │
│         │  [  Sign in  ]           │             │
│         │                          │             │
│         │  ─── or ───              │             │
│         │                          │             │
│         │  Don't have an account?  │             │
│         │  Create one              │             │
│         └──────────────────────────┘             │
│                                                  │
└──────────────────────────────────────────────────┘
```

- Centered card (shadcn `Card`), max-width ~400px
- Forgot password link (phase 2)
- Error state: inline pod inputom + top-of-card alert pre generické errors

## /agents (list)

```
┌─ Agents ────────────────────────────────────────────────────────┐
│ [🔍 Search…                        ] [Filter ▼]  [+ New agent ▼]│
│                                                   ├ Manually     │
│ ┌──────────────────────────────────────────────┐  └ With Builder │
│ │ Name             Model     Triggers  Executions(24h)  Status       ⋮│
│ ├──────────────────────────────────────────────┤                │
│ │ PR Reviewer    sonnet-4-6  http,chat    12    ● active       ⋮│
│ │ Support Triage opus-4-6    http          4    ● active       ⋮│
│ │ Morning brief  sonnet-4-6  cron          1    ● active       ⋮│
│ │ Archived test  —           —             —    ○ archived     ⋮│
│ └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│ 20 of 34 · [<] [Next >]                                          │
└──────────────────────────────────────────────────────────────────┘
```

- Data table (shadcn `Table`), sortable kolumny
- Row click → detail. `⋮` kebab menu → Edit, Duplicate, Archive, Delete
- Empty state: illustration + "Create your first agent" + dva CTA (Manually / with Builder)
- "New agent" button s dropdown na výber mode

## /agents/new (manual editor)

Dvojkolónkový layout, live preview napravo.

```
┌─ New Agent ───────────────────────────────────────────────────────────┐
│ [← Back to agents]                                [Save draft] [Save] │
│                                                                       │
│ ┌─ Config ─────────────────────┐ ┌─ Preview / Test ─────────────────┐│
│ │ Name *                        │ │  System prompt (truncated)      ││
│ │ [ PR Reviewer              ]  │ │  ─────────────────────────────  ││
│ │                               │ │  You are a senior engineer…     ││
│ │ Description                   │ │                                 ││
│ │ [ Reviews GitHub PRs …    ]   │ │  Tools available:               ││
│ │                               │ │  · github__create_issue         ││
│ │ ─── Model ───                 │ │  · github__add_comment          ││
│ │ Provider   [Anthropic    ▼]   │ │  · filesystem__read             ││
│ │ Model      [Sonnet 4.6   ▼]   │ │                                 ││
│ │ Temp       [─●───────] 0.2    │ │  ──────────────────────────     ││
│ │                               │ │  Test run                       ││
│ │ ─── System prompt ───         │ │  Input (JSON):                  ││
│ │ ┌─────────────────────────┐   │ │  { "prUrl": "…" }               ││
│ │ │ You are a senior        │   │ │  [ Run test ]                   ││
│ │ │ engineer reviewing…     │   │ │                                 ││
│ │ └─────────────────────────┘   │ └─────────────────────────────────┘│
│ │                               │                                     │
│ │ ─── Tools (MCP) ───           │                                     │
│ │ [+ Attach MCP server]         │                                     │
│ │ · github      work-account ✕  │                                     │
│ │ · filesystem  sandbox      ✕  │                                     │
│ │                               │                                     │
│ │ ─── Limits ───                │                                     │
│ │ Max cost   [  $5.00 ]         │                                     │
│ │ Max iter   [    25  ]         │                                     │
│ └───────────────────────────────┘                                     │
└───────────────────────────────────────────────────────────────────────┘
```

- Auto-save draft každých X sekúnd (status indikátor pri Save button)
- Attach MCP → dialog s katalógom + výber credentials
- Test run → otvorí Execution viewer v modal/drawer s timeline (bez perzistencie ak test mode)

## /agents/new?mode=builder (Agent Builder chat)

```
┌─ Create with Agent Builder ──────────────────────────────────────────┐
│ [← Back]                                                              │
│                                                                       │
│ ┌────────────────────────────────────────────────────────────────────┐│
│ │  🤖 Hi! I'll help you create an agent. What do you want it to do? ││
│ ├────────────────────────────────────────────────────────────────────┤│
│ │                                                                    ││
│ │  tomaj:  Review pull requests on my GitHub repo and comment       ││
│ │          on style issues.                                         ││
│ │                                                                    ││
│ │  🤖 Nice. A few questions:                                        ││
│ │    1. Which repo(s)?                                               ││
│ │    2. Which style rules should it check?                           ││
│ │    3. Should it auto-comment or just prepare a comment?            ││
│ │                                                                    ││
│ │  🤖 [tool: list_mcp_servers]                                      ││
│ │     → found: github, linear, slack, filesystem, …                  ││
│ │                                                                    ││
│ │  🤖 I recommend attaching the `github` MCP server. Ready to       ││
│ │     connect your GitHub account?       [Connect GitHub]            ││
│ │                                                                    ││
│ ├────────────────────────────────────────────────────────────────────┤│
│ │  [Type your message…                                     ] [Send] ││
│ └────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

- Rovnaký chat komponent ako `/chat/:sessionId`
- Tool calls sa zobrazia ako inline cards, ale zrolované pre čitateľnosť
- Finalizácia: Builder ukáže "preview card" s full config + tlačidlo **Create agent**

## /executions (list) a /executions/:id (detail)

List:
```
┌─ Executions ──────────────────────────────────────────────────────────────┐
│ [Agent ▼] [Status ▼] [Last 24h ▼]           [Live: 3 running]       │
├─────────────────────────────────────────────────────────────────────┤
│ Agent          Trigger    Status      Started    Duration  Cost    ⋮│
├─────────────────────────────────────────────────────────────────────┤
│ PR Reviewer    http       ● running   2 min ago  —         $0.02  ⋮│
│ PR Reviewer    http       ✓ ok        12 min ago  18s      $0.08  ⋮│
│ Morning brief  cron       ✓ ok        08:00       4s       $0.01  ⋮│
│ Support Triage http       ✕ failed    09:14       2s       —      ⋮│
└─────────────────────────────────────────────────────────────────────┘
```

Detail (timeline ako hlavná vec):

```
┌─ Execution #abc123 · PR Reviewer ─────────────────────────────────────────┐
│ Status: ● running      Started: 12:04:21       Cost: $0.03          │
│ Trigger: http webhook  Model: claude-sonnet-4-6  Tokens: 2,341      │
│ [Cancel] [Replay] [Export JSON]                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Input:                                                              │
│  { "prUrl": "https://github.com/acme/api/pull/123" }                │
├─────────────────────────────────────────────────────────────────────┤
│  ╭─ 12:04:21.004 · run_started                                      │
│  │                                                                   │
│  ├─ 12:04:21.120 · 🧠 llm_request (sonnet-4-6, 1452 tokens)        ▸│
│  │                                                                   │
│  ├─ 12:04:23.990 · 🧠 llm_response (324 tokens out, 2 tool calls)   │
│  │   "I'll fetch the PR and review the diff…"                       │
│  │                                                                   │
│  ├─ 12:04:24.010 · 🔧 tool_call  github__get_pr                    ▸│
│  │   args: { owner: "acme", repo: "api", number: 123 }              │
│  │                                                                   │
│  ├─ 12:04:24.890 · ✓ tool_result                             (880ms)│
│  │   { title: "Fix auth bug", changedFiles: 4, … }                  │
│  │                                                                   │
│  ├─ 12:04:24.900 · 🔧 tool_call  github__add_comment           ▸    │
│  │   args: { prNumber: 123, body: "…" }                             │
│  │                                                                   │
│  │                                                                   │
│  ● running…                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

- Timeline je vertikálny feed, každá položka je **collapsible card**
- Ikony: 🧠 LLM, 🔧 tool call, ✓ result, ✕ error, 📝 log
- Live updates cez SSE — nové položky fade-in dole, auto-scroll (pauza ak user scrolluje hore)
- Hover na položku → zvýraznenie paru (tool_call ↔ tool_result)
- Expand detail = full JSON payload, copy button

## /chat/:sessionId (chat s agentom)

```
┌─ Chat · PR Reviewer ────────────────────────────────────────────────┐
│  Session: "Debugging pipeline PR"              [⋮] (rename, delete) │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  tomaj:  Can you look at PR #234?                                   │
│                                                                     │
│  Agent:  [▾ 2 tool calls, 3.2s]                                    │
│          I reviewed PR #234. Key findings:                          │
│          · style issue in src/auth.ts:42                            │
│          · missing test for the new endpoint                        │
│          · dependency on unreleased feature flag                    │
│                                                                     │
│  tomaj:  Comment on the PR with these points                        │
│                                                                     │
│  Agent:  [▾ tool call: github__add_comment · 1.1s]                 │
│          Done. Comment posted: link                                 │
│                                                                     │
│  ─── live ───                                                       │
│  Agent:  ● thinking…                                                │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Type a message…                                         ] [Send]  │
└─────────────────────────────────────────────────────────────────────┘
```

- Assistant bubble default zbalená na summary; expand → full timeline per správu
- "● thinking…" pulse indicator počas runu

## /mcp (catalog)

```
┌─ MCP Servers · Catalog ─────────────────────────────────────────────┐
│ [🔍 Search…                                    ]                    │
│                                                                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │
│ │ GitHub       │ │ Slack        │ │ Linear       │                 │
│ │ Issues, PRs… │ │ Channels,… │ │ Tickets…     │                 │
│ │ OAuth · stdio│ │ OAuth · stdio│ │ Token · http │                 │
│ │ [Connect]    │ │ [Connect]    │ │ [Connect]    │                 │
│ └──────────────┘ └──────────────┘ └──────────────┘                 │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │
│ │ Gmail        │ │ Filesystem   │ │ Shell        │                 │
│ │ …            │ │ …            │ │ …            │                 │
│ └──────────────┘ └──────────────┘ └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

- Grid of cards (shadcn `Card`)
- Each = server name, description, transport + auth badge, [Connect] / [Already connected] stav

## /mcp/credentials

```
┌─ Credentials ───────────────────────────────────────────────────────┐
│                                                   [+ Add credential]│
│                                                                     │
│ Server      Label              Type    Expires    Last used    ⋮    │
├─────────────────────────────────────────────────────────────────────┤
│ github      Work account       OAuth   in 3 days  2 min ago    ⋮   │
│ github      Personal           OAuth   —          never        ⋮   │
│ linear      Main workspace     Token   —          1 day ago    ⋮   │
│ slack       Acme               OAuth   ⚠ expired  yesterday    ⋮   │
└─────────────────────────────────────────────────────────────────────┘
```

- Expiring soon / expired credentials: warning badge + "Refresh now" action
- `⋮` menu: Test, Disconnect, Delete

## /agents/:id (detail view s tabs)

```
┌─ PR Reviewer ────────────── [Edit] [Duplicate] [⋮ Archive] ────────┐
│ Tabs: [Overview] [Triggers] [Runs] [Versions] [Settings]            │
├─────────────────────────────────────────────────────────────────────┤
│  Overview                                                           │
│                                                                     │
│  Description: Reviews GitHub PRs…                                   │
│  Model: claude-sonnet-4-6                                           │
│  System prompt: [expand ▾]                                          │
│  Tools: github (work), filesystem (sandbox)                         │
│                                                                     │
│  ─── Recent executions ───                                                │
│  [lista posledných 10 runov]                                        │
│                                                                     │
│  ─── Cost (last 7d) ───                                             │
│  [mini chart]                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Triggers tab

```
┌─ Triggers ────────────────────────── [+ Add trigger ▼] ────────────┐
│                                       ├ HTTP webhook              │
│ ┌─ HTTP · "GitHub webhook" ───────┐   ├ Cron schedule             │
│ │ URL: https://…/triggers/abc     │   └ Chat (always on)          │
│ │ API key: agx_abc12345_…  [copy] │                                │
│ │ Mode: async                     │                                │
│ │ ● enabled        [Disable] [⋮]  │                                │
│ └─────────────────────────────────┘                                │
│ ┌─ Cron · "Daily summary" ────────┐                                │
│ │ Schedule: 0 8 * * *  (Europe/Bratislava)                         │
│ │ Last run: 3 hours ago · ok                                       │
│ │ Next run: in 21 hours                                            │
│ │ ● enabled       [Run now] [Disable] [⋮]                          │
│ └──────────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

## /settings/org + members

```
┌─ Organization settings ─────────────────────────────────────────────┐
│ General | Members | Billing (phase 8)                               │
├─────────────────────────────────────────────────────────────────────┤
│ Name      [ Acme Inc                           ] [Save]             │
│ Slug      acme-inc (read-only, contact support to change)           │
│ Created   Jan 15, 2026                                              │
│                                                                     │
│ Danger zone                                                         │
│ [Delete organization]                                               │
└─────────────────────────────────────────────────────────────────────┘
```

Members tab:
```
│ Member               Role      Joined      ⋮                        │
├─────────────────────────────────────────────────────────────────────┤
│ Tomaj (you)          Owner     Jan 15      —                        │
│ colleague@acme.com   Member    Feb 2       ⋮                        │
│                                            [Invite member]          │
```

## Notifications panel (dropdown)

```
┌─ Notifications ─────────────────────────────────────────────────────┐
│ [Mark all read]                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ ● Run failed: PR Reviewer  (2 min ago)                              │
│   github API returned 403 — credentials expired                     │
│                                                                     │
│ ● Slack credential expires in 3 days                                │
│   [Refresh]                                                         │
│                                                                     │
│ · Run completed: Morning brief  (3 hours ago)                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Command palette (⌘K)

```
┌─ ⌘K ────────────────────────────────────────────────────────────────┐
│ [> Search agents, runs, actions…                              ] ⏎  │
├─────────────────────────────────────────────────────────────────────┤
│  Actions                                                            │
│    Create agent                                                     │
│    Talk to Agent Builder                                            │
│    Go to executions                                                       │
│    Connect MCP server                                               │
│                                                                     │
│  Agents                                                             │
│    PR Reviewer                                                      │
│    Support Triage                                                   │
│    Morning brief                                                    │
│                                                                     │
│  Recent executions                                                        │
│    #abc123 · 2 min ago · running                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Responsive

- **Desktop first** (1440px+) — full experience
- **Tablet 900-1440px** — sidebar collapsible, tables horizontal scroll
- **Mobile <900px** — read-only admin OK, editor deprioritized; sidebar → bottom sheet / drawer (Phase 9)

## Darkmode

All wireframes vyššie fungujú identicky v dark mode (shadcn default dark palette). Toggle = system/light/dark.
