# 08 — Sandbox Execution

Každý execution beží v izolovanom sandbox-e. **Default = Docker** naprieč dev aj prod. `SANDBOX_MODE=folder` existuje **len pre unit testy** kde chceme zero overhead a žiadne container dependencies.

## Prečo Docker default aj v dev

- **Folder mode je bezpečnostná ilúzia** — ak agent má `shell` MCP, jedno `cd ..` ho vytrhne von z workspace a agent má prístup k `~/.ssh`, env variables, čokoľvek. V dev pri testovaní agentov s real tools je to nemilé.
- **Docker overhead na Mac ARM je 200-500 ms per execution** — pre 5-60 sekundové agent runs zanedbateľné
- **Parita dev ↔ prod** — rovnaké runtime correctness, žiadne "funguje mi to lokálne" bugs
- **Už máme Docker Desktop** — pre Postgres/Redis by to inak tiež bolo treba (áno, postgres je lokálne, ale Docker Desktop je typicky nainštalovaný)

## Prečo sandbox vôbec

- **Filesystem izolácia** — agent vidí iba `/workspace`
- **Process izolácia** — spawned MCP processy (shell, python) bežia v containeri, nie na host-e
- **Network policy** (Phase 6+) — outbound traffic cez proxy s allowlist
- **Resource limits** — CPU, memory, PIDs
- **Čistý state** — po skončení runu container + workspace zmazané

## Sandbox interface

```ts
interface Sandbox {
  id: string;                // = executionId
  workspacePath: string;     // absolute path viditeľný z runner procesu
  init(): Promise<void>;
  runProcess(spec: ProcessSpec): Promise<ChildProcess>;  // pre stdio MCP servery
  cleanup(): Promise<void>;
}
```

## Folder sandbox (unit testy only)

Implementácia: `FolderSandbox` v `packages/sandbox`. Aktivovaná iba cez `SANDBOX_MODE=folder` v test env.

- Pri `init()` vytvorí `./workspaces/{executionId}/` (root configurable)
- `workspacePath` = tento folder
- `runProcess()` = `child_process.spawn()` s `cwd = workspacePath`
- `cleanup()`: killne procesy + zmaže folder

**Nebezpečenstvo:**
- **Žiadna izolácia host filesystem** — MCP processy (najmä `shell`, `python`) môžu `cd /` a čítať čokoľvek
- V folder móde **odmietneme** loadovať sensitívne MCP servery: `shell`, `python_exec`, `filesystem` s neobmedzeným `rootPath`
- Pre testy: používame iba fake/mock MCP servery v folder móde — nikdy reálne

**Konfigurácia** (`packages/mcp-registry`):
```ts
McpCatalog[slug].requiresIsolation: boolean  // true pre shell/python/filesystem
```
Ak `SANDBOX_MODE=folder` a binding má server s `requiresIsolation: true` → reject pri agent load s clear error.

## Docker sandbox (default dev + prod)

Implementácia: `DockerSandbox`.

- Pri `init()`:
  1. Vytvorí workspace folder na host-e: `/var/agentx/workspaces/{executionId}/`
  2. Spustí container (`agentx-sandbox:latest`) cez Dockerode:
     ```
     image: agentx-sandbox:latest     # pre-built s Node, python, curl, git, …
     volumes: { /var/agentx/workspaces/{executionId}: /workspace }
     cwd: /workspace
     memory: 2 GB (konfigurovateľné)
     cpus: 1.0
     network: sandbox_net             # custom network s proxy
     env: { RUN_ID, AGENT_ID, … }
     stop_timeout: 10 s
     ```
- `workspacePath` = `/var/agentx/workspaces/{executionId}` na host-e, ale runner vidí v container ako `/workspace`
- `runProcess()` = `docker exec` do container-a s daným command-om (pre stdio MCP servery)
- `cleanup()`:
  - `docker stop` + `docker rm`
  - Zmaže workspace folder

### Network policy (optional, phase 2)

- Vlastná bridge network bez default internet accessu
- HTTP(S) proxy container (Squid) s allowlist domén per agent (v budúcnosti)
- Outbound logging — vidíš kam agent volal

### Image build

`docker/sandbox.Dockerfile`:

```
FROM node:22-slim
RUN apt-get update && apt-get install -y python3 python3-pip curl git ...
# pre-install common MCP servery (@modelcontextprotocol/server-filesystem, etc.)
RUN npm install -g @modelcontextprotocol/server-filesystem ...
WORKDIR /workspace
```

Build z CI alebo `pnpm sandbox:build`.

## HTTP / SSE MCP servery

Nezávisí od sandbox módu — runner otvorí HTTP client z vlastného procesu (nie zo sandbox containera). Dôvod: credentials sú v runnerovom pamäťovom priestore a nechceme ich púšťať do sandboxu.

## Stdio MCP servery v docker móde

Runner potrebuje komunikovať cez stdio s procesom vnútri containera. Dve možnosti:

1. **`docker exec` s `-i`** — spojíme stdin/stdout runnera s procesom v containeri. Jednoduché.
2. **MCP server v containeri exposuje HTTP endpoint**, runner komunikuje HTTP-om. Robustnejšie ale treba zmeniť MCP config.

MVP: **Option 1** — `docker exec -i` s process pipe. Existujúce MCP stdio servery fungujú bez zmeny.

## Resource enforcement

Docker:
- `--memory=2g`
- `--cpus=1.0`
- `--pids-limit=512`
- Disk: quota na workspace folder (cez `prjquota` mount option) — phase 2

Folder mód: žiadne hard limity, spoliehame na beh v dev.

## Čo **nie je** v scope MVP

- Firecracker / gVisor — overkill pre 1 stroj
- E2B / Daytona — vendor lock-in, neskôr ak bude treba
- Snapshotting state medzi runmi — každý run čistý
- Shared filesystem medzi runmi tej istej chat session — zatiaľ nie (každý run = fresh workspace). Ak treba pamäť, urobíme cez MCP server s PG backend (agent memory).
