# 19 — Code Patterns

Architektonické a kódové patterny ktoré používame naprieč backendom (`apps/api`, `apps/runner`) a frontendom. Cieľ: konzistencia, testovateľnosť, ľahký onboard.

## Backend layering (NestJS)

```
┌───────────────────────────────────────────────────────────┐
│ Controller       │ HTTP/SSE boundary. Validuje input,     │
│                  │ volá service, vracia DTO.              │
├───────────────────────────────────────────────────────────┤
│ Service          │ Biznis logika. Orchestruje repozitáre, │
│                  │ events, iné services.                  │
├───────────────────────────────────────────────────────────┤
│ Repository       │ Všetky DB queries. Drizzle volania,    │
│                  │ tu a nikde inde.                       │
├───────────────────────────────────────────────────────────┤
│ Entity / mapper  │ Mapovanie DB row ↔ domain object,      │
│                  │ domain ↔ DTO.                          │
└───────────────────────────────────────────────────────────┘
```

**Pravidlo:** Controller **nikdy** nesahá priamo do repository. Service **nikdy** nepíše raw SQL.

## Patterns, ktoré používame

### 1. Repository pattern

**Kde:** `apps/api/src/<module>/<module>.repository.ts`.

```ts
@Injectable()
export class AgentRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: string, orgId: string): Promise<Agent | null> {
    const row = await this.db.query.agents.findFirst({
      where: and(eq(agents.id, id), eq(agents.orgId, orgId)),
      with: { currentVersion: true },
    });
    return row ? toAgent(row) : null;
  }

  async create(input: NewAgent): Promise<Agent> { ... }
  async updateVersion(agentId: string, data: AgentVersionInput): Promise<AgentVersion> { ... }
  async list(orgId: string, filters: AgentFilters): Promise<Paged<Agent>> { ... }
}
```

- Všetky DB queries len tu
- Vracia domain objekty (nie raw Drizzle result)
- Naming: `findById`, `findByX`, `list`, `create`, `update`, `delete` — konzistentne
- Žiadna biznis logika (validácie, side effects) — čisté CRUD + queries

### 2. Service pattern

```ts
@Injectable()
export class AgentService {
  constructor(
    private readonly agents: AgentRepository,
    private readonly bindings: AgentMcpBindingRepository,
    private readonly events: EventBus,
    private readonly policy: AgentPolicy,
  ) {}

  async createAgent(actor: Actor, input: CreateAgentInput): Promise<Agent> {
    this.policy.canCreate(actor);
    const agent = await this.agents.create({ ...input, orgId: actor.orgId, createdBy: actor.userId });
    this.events.emit("agent.created", { agentId: agent.id, actorId: actor.userId });
    return agent;
  }

  async updateConfig(actor: Actor, agentId: string, changes: AgentConfigChanges): Promise<Agent> {
    const agent = await this.agents.findById(agentId, actor.orgId);
    if (!agent) throw new NotFoundError("agent");
    this.policy.canUpdate(actor, agent);

    const newVersion = await this.agents.updateVersion(agentId, {
      ...agent.currentVersion,
      ...changes,
      version: agent.currentVersion.version + 1,
      createdBy: actor.userId,
    });
    this.events.emit("agent.updated", { agentId, newVersionId: newVersion.id });
    return { ...agent, currentVersion: newVersion };
  }
}
```

- Žiadny priamy prístup do DB
- Orchestruje repozitáre + policy + events
- Každý service method má jasný "actor" input (kto to robí) pre audit + authz

### 3. DTO + Zod validation

**Zdieľané v `@agentx/shared`**:
```ts
// packages/shared/src/schemas/agents.ts
export const createAgentDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1).max(50_000),
  modelProvider: z.enum(["anthropic", "openai", "google"]),
  modelId: z.string(),
  params: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    // ...
  }).optional(),
  bindings: z.array(createBindingDto).optional(),
});
export type CreateAgentDto = z.infer<typeof createAgentDto>;
```

**V Nest controlleri** (cez `nestjs-zod` alebo vlastný `ZodValidationPipe`):
```ts
@Post()
async create(@Body() body: CreateAgentDto, @CurrentActor() actor: Actor) {
  const agent = await this.agentService.createAgent(actor, body);
  return toAgentResponse(agent);
}
```

**Na frontende** (rovnaká schéma!):
```ts
const form = useForm<CreateAgentDto>({
  resolver: zodResolver(createAgentDto),
});
```

### 4. Policy objects (authz)

```ts
@Injectable()
export class AgentPolicy {
  canCreate(actor: Actor) {
    if (!actor.roles.includes("owner") && !actor.roles.includes("admin") && !actor.roles.includes("member")) {
      throw new ForbiddenError("agent.create");
    }
  }

  canUpdate(actor: Actor, agent: Agent) {
    if (agent.createdBy === actor.userId) return;
    if (actor.roles.includes("owner") || actor.roles.includes("admin")) return;
    throw new ForbiddenError("agent.update");
  }

  canDelete(actor: Actor, agent: Agent) { ... }
}
```

- Jedna policy class per resource
- Injectable → test-friendly
- `throw` zmysluplnú Error triedu (chytí global exception filter a vráti 403)

### 5. Event bus (side effects decouple)

Používame interný `@nestjs/event-emitter` alebo vlastný `EventBus`:

```ts
this.events.emit("run.completed", { executionId, status, cost });
```

**Konzumenti** (registered handlers):
- `AuditLogListener` → pridá do `audit_log`
- `NotificationListener` → pošle notif ak user sledoval run
- `MetricsListener` → OpenTelemetry counter

**Prečo:** Service sa nemusí starať o audit/notif/metriky — emit event a ide ďalej. Testy jednotlivých services sa nezaoberajú "a zavolalo sa notif?".

### 6. Error classes

Žiadne `throw new Error("bad thing")`. Typed errors:

```ts
// packages/shared/src/errors.ts
export class NotFoundError extends DomainError {
  constructor(public readonly resource: string) { super(`${resource} not found`); }
}
export class ForbiddenError extends DomainError {
  constructor(public readonly action: string) { super(`forbidden: ${action}`); }
}
export class ValidationError extends DomainError { ... }
export class BudgetExceededError extends DomainError { ... }
```

Global exception filter v Nest ich mapuje na HTTP status + Problem Details body:
- `NotFoundError` → 404
- `ForbiddenError` → 403
- `ValidationError` → 400
- unknown → 500 + log

### 7. DI container + testability

Wszystko ide cez NestJS DI. V testoch override-ujeme individual providers:

```ts
const module = await Test.createTestingModule({
  providers: [
    AgentService,
    { provide: AgentRepository, useValue: mockRepo },
    { provide: EventBus, useValue: mockEvents },
    AgentPolicy,
  ],
}).compile();
```

### 8. Guards & interceptors

- **`JwtAuthGuard`** — overí access token, naplní `req.actor`
- **`OrgScopeGuard`** — overí že user je member orgu z `X-Org-Id`
- **`ApiKeyAuthGuard`** — pre webhook endpoints
- **`LoggingInterceptor`** — request/response log
- **`TransformInterceptor`** — wrap response to standard envelope ak treba

### 9. CurrentActor decorator

```ts
@Post()
create(@CurrentActor() actor: Actor, @Body() body: CreateAgentDto) { ... }
```

Custom param decorator extrahuje `{ userId, orgId, roles }` z requestu (populated by JwtAuthGuard).

### 10. Drizzle specifics

- Schema v `packages/db/src/schema/*.ts`, jeden súbor per doména (agents, runs, mcp, …)
- Relations definované explicitne (Drizzle `relations`)
- Žiadne raw SQL v repositories (Drizzle query builder), **okrem** komplikovaných analytics queries → jasne označené a commentované
- Migrations: `pnpm db:generate` po zmene schémy, **nikdy** ručne editovať old migration

### 11. Transakcie

```ts
await this.db.transaction(async (tx) => {
  const agent = await this.agents.with(tx).create(...);
  const version = await this.agents.with(tx).createVersion(...);
  return agent;
});
```

Repository má `.with(tx)` method ktorý vracia inštanciu bound na transaction scope. Service rozhoduje kedy treba transaction.

### 12. Background jobs (BullMQ)

- Producer — v service layer-i volá `this.queue.add("run", data)`
- Consumer — `@Processor("run")` v `apps/runner`, jednoduchý handler ktorý delegate-uje na `AgentExecutor` z `@agentx/agent-core`

```ts
@Processor("run")
export class RunProcessor extends WorkerHost {
  async process(job: Job<ExecutionJob>) {
    const runner = this.runners.createFor(job.data);
    await runner.execute();
  }
}
```

## Frontend patterns

### 1. React Server Components default

- Stránky v `app/` sú RSC by default (data fetch server-side)
- Client components iba keď treba stav / interakciu (`"use client"`)
- Server actions pre mutations kde RSC stačí, inak fetch na API

### 2. Data fetching

- Server: priamo z API cez `fetch` s next.js caching
- Client: **TanStack Query** (react-query) pre pollable data + SSE subscriptions
- Typy z `@agentx/shared` — žiadne re-declare

### 3. Forms

- `react-hook-form` + `zodResolver(schema)` z `@agentx/shared`
- Submit handler je **typed** `(data: CreateAgentDto) => Promise<void>`
- Server action alebo API call, optimistic UI podľa `15-ux-guidelines.md`

### 4. Error handling

- Error boundary per route segment (Next.js `error.tsx`)
- API errory → mapované na user-friendly messages (cez `error.type` z Problem Details)
- Toast len pre unexpected, inline pre validation

### 5. SSE subscriptions

```tsx
// hooks/useExecutionEvents.ts
export function useExecutionEvents(executionId: string) {
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  useEffect(() => {
    const es = new EventSource(`${API_URL}/executions/${executionId}/events`);
    es.onmessage = (e) => setEvents((prev) => [...prev, JSON.parse(e.data)]);
    return () => es.close();
  }, [executionId]);
  return events;
}
```

Virtualizácia pre dlhé timeline (react-virtual).

## Kedy **neporušovať** patterns

Niekedy má zmysel odchýliť sa. Dve pravidlá:

1. **Vysvetli v PR description prečo.** Ak nemáš dobrý dôvod, choose boring (default pattern).
2. **Nerefactoruj existujúce porušenia** bez vlastného issue/PR. Fix v rámci nesúvisiaceho feature-u = scope creep.

## Co **nepoužívame** a prečo

- **CQRS / use-cases layer** — premature pre MVP, services stačia. Ak sa jeden service stane komplexný, extrahneme use-cases iba tam.
- **Hexagonal / onion puristicky** — áno principiálne driver/driven separovanie (repo = port), ale nechceme packagey ako `domain/`, `application/`, `infrastructure/`. Zbytočný ceremony.
- **Class-based domain entities s methods** — domain methods (business rules, validácie) dávame do `service` alebo pure function v `packages/shared`. Entity = len dáta.
- **ORM pre ORM** (Prisma s ricketové schemas, TypeORM) — Drizzle je bližšie SQL, viac kontroly.
- **Redux / Zustand na FE** — TanStack Query + URL state + local component state stačí pre admin app.

## Test patterns

- **Unit**: service volá mock repo, mock events → asserty na business logic (no DB/network)
- **Integration**: real DB (Drizzle), real repo, mocked externals (LLM, MCP) → testuje SQL
- **E2E**: viď `18-e2e-testing.md`
- Test co-location: `*.service.spec.ts` vedľa `*.service.ts`, `*.repository.spec.ts` vedľa repo
