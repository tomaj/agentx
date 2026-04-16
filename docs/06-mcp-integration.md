# 06 — MCP Integration

## Katalóg MCP serverov

`mcp_servers` tabuľka = single source of truth. Na štarte seedujeme dobre známe servery.

### Príklady built-in serverov

| Slug | Transport | Auth | Poznámka |
|---|---|---|---|
| `filesystem` | stdio | none | Operácie v sandbox workspace-e |
| `shell` | stdio | none | Bash príkazy, obmedzené na sandbox |
| `http-fetch` | stdio | none | HTTP klient |
| `github` | stdio | oauth2 | `@modelcontextprotocol/server-github` |
| `slack` | stdio | oauth2 | |
| `linear` | http | static_token | API token |
| `gmail` | stdio | oauth2 | |
| `notion` | http | oauth2 | |
| `postgres` | stdio | static_token | Read-only per default |

Neskôr: admin UI na pridávanie custom MCP serverov (URL / command / auth config).

## Launch & lifecycle

`@agentx/mcp-registry` poskytuje `McpLoader`:

```ts
loader.load(bindings: AgentMcpBinding[], sandbox: Sandbox): Promise<McpClient[]>
```

Pre každý binding:
1. Dešifruje credential
2. Rozhoduje transport:
   - **stdio**: `spawn(config.command, config.args, { env: {...decryptedEnv, ...config.env} })` — buď v sandbox processe alebo v sandbox containeri
   - **http / sse**: otvorí MCP HTTP client s autorizačnými header-mi
3. Handshake MCP (`initialize`, `tools/list`)
4. Vráti `McpClient`

Pri `sandbox.cleanup()` všetci klienti sa zatvoria, processy killnú.

## Auth typy

### `none`
Bez credentials. Napr. `filesystem` scoped na workspace.

### `static_token`
Jeden token v `mcp_credentials.encrypted_payload.token`. Runner ho injektne do MCP processu ako env var (napr. `LINEAR_API_KEY`) alebo do Authorization header-a pri HTTP transporte. Config server metadata povie **kam** sa má token namapovať.

### `oauth2`
Používa sa pri serveroch ako GitHub, Slack, Gmail.

**OAuth flow (platform ako OAuth client):**

1. User v UI klikne "Connect GitHub"
2. FE → `GET /mcp/:serverId/oauth/start` → API redirectuje na `authUrl` s `state=<signed>`, `redirect_uri=https://agentx/.../callback`
3. User autorizuje → GitHub redirectuje späť na API callback
4. API vymení `code` za `accessToken` + `refreshToken` + `expiresAt`
5. Šifruje a uloží do `mcp_credentials`
6. UI zobrazí "Connected ako @username"

**Refresh:**
- Cron job (BullMQ repeatable) každých N minút hľadá credentials s `expires_at < now + 10min`
- Refreshne a uloží
- Pri samotnom run-e ak expiry spadne počas behu: on-demand refresh + retry jednorazovo

**Race condition protection (advisory lock):**

Dva paralelné executions toho istého agenta, token expiruje v rovnakom momente → obidva by sa pokúsili refresh → jeden uspeje, druhý by OAuth provider odmietol (replay detection) a mal by stale token.

Riešenie: Postgres advisory lock per credential:
```sql
SELECT pg_try_advisory_xact_lock(hashtext('mcp_cred:' || credential_id));
```
- Runner pred refresh-om `BEGIN` → `pg_try_advisory_xact_lock` → ak **got lock**, robí HTTP refresh call + `UPDATE mcp_credentials` + `COMMIT`
- Ak **nezískal lock** (iný process ho drží), počká (poll každých 200 ms, max 5 s) a potom re-fetch credential z DB — dostane už refresh-nuté tokens
- Rovnaký mechanizmus v refresh cron jobe (aby sa dva scheduler instances nešli biť)

**Rotácia:**
- User môže "disconnect" → `revoked_at` + nulluje encrypted payload
- Ak MCP server podporuje token revocation endpoint, pošleme mu revoke call

## Per-agent bindings & scoping

Pri tvorbe agenta user vyberie:
- Ktoré MCP servery mu priradiť (`agent_mcp_bindings`)
- Ktoré credential label použiť (napr. "Work GitHub" vs "Personal GitHub")
- Whitelist toolov z MCP servera (default: všetky) — obmedzí čo môže agent volať

Runner pri loadovaní:
- Načíta binding
- Zoberie credential ownera (ktorý je bindingom určený; default = owner agenta)
- Aplikuje `allowedTools` filter pri `tools/list`

## Bezpečnosť

- **Sandbox-only file access** — `filesystem` MCP má `rootPath` forcovaný na workspace folder
- **Network policy** (keď bude Docker sandbox): default allow iba HTTP/HTTPS cez proxy, ktorý loguje všetky odchádzajúce requesty
- **Audit** — každý MCP credential load, každý OAuth callback → `audit_log`

## Tool naming convention

Ako už v runtime docs: pri zbere toolov z MCP clientov prefixujeme `{mcpServerSlug}__{toolName}`. Dôvod: jeden LLM call dostane tooly od viacerých MCP-čok naraz, potrebujú mať unikátne mená a chceme vedieť deterministicky routovať.

## Chyby z MCP

Ak tool call hodí error (network, auth, timeout, invalid args):
- Runner zabalí do `ToolResultMessage` so `isError: true`
- LLM dostane chybu ako tool result (štandardná MCP konvencia) — vie z nej reagovať (retry s iným argumentom alebo vysvetliť userovi)
- Všetky tool errory idú aj do `execution_events` typu `error` (pre audit)
