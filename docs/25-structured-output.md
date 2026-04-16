# 25 — Structured Output

Ako agenti vracaju strukturovane data namiesto volneho textu.

## Problem

Webhook volajuci (CI/CD pipeline, backend service, Zapier) potrebuje od agenta **JSON v konkretnom tvare**, nie volny text. Priklad:

```
// Volajuci ocakava:
{ "category": "bug", "priority": "high", "assignee": "jan.novak" }

// Agent vracia:
"Based on my analysis, this ticket appears to be a high-priority bug.
 I would recommend assigning it to Jan Novák."
```

Druhy output je pre cloveka ok, pre stroj nepouzitelny.

## Riesenie: per-agent `outputSchema`

Kazdy agent moze mat definovanu **output schemu** — Zod schema ulozenu v `agent_versions.params.outputSchema`.

```ts
// agent_versions.params
{
  "outputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": ["bug", "feature", "question", "task"]
      },
      "priority": {
        "type": "string",
        "enum": ["low", "medium", "high", "critical"]
      },
      "assignee": {
        "type": "string",
        "description": "GitHub username of the recommended assignee"
      },
      "summary": {
        "type": "string",
        "description": "One-sentence summary of the ticket"
      }
    },
    "required": ["category", "priority", "summary"]
  }
}
```

Schema je ulozena ako JSON Schema (draft 2020-12). V UI sa edituje cez vizualny editor, v API sa posiela priamo ako JSON.

## Implementacia: `__output` tool pattern

Namiesto toho, aby sme parsovali volny text agenta, pouzivame elegantnejsi pristup: **pridáme agentovi specialny tool `__output`**, ktory ma ako input schema presne nasu output schemu.

### Injekcia do system promptu

Ked agent ma `outputSchema`, `claude-runtime.ts` prida na koniec system promptu:

```
When you have completed your task and are ready to return your final answer,
you MUST call the `__output` tool with your structured result.
Do NOT return your answer as plain text. Always use the `__output` tool.
```

### Injekcia `__output` toolu

```ts
// packages/agent-core/runtime/structured-output.ts

function injectOutputTool(tools: Tool[], outputSchema: JSONSchema): Tool[] {
  const outputTool: Tool = {
    name: '__output',
    description: 'Submit your final structured result. Call this exactly once when you have completed your task.',
    input_schema: outputSchema,
  };
  return [...tools, outputTool];
}
```

### Runtime handling

Ked agent zavola `__output`:

```ts
// V claude-runtime.ts event loop
if (toolCall.name === '__output') {
  // Neposielame do MCP servera — je to virtual tool
  const result = toolCall.input;  // uz je to parsed JSON
  execution.structuredOutput = result;
  execution.status = 'completed';
  // Vratime tool result "Success" aby agent vedel ze output bol prijaty
  return { type: 'tool_result', content: 'Output accepted.' };
}
```

## Validacia

### Po execution

Aj ked `__output` tool ma schemu, Claude moze (zriedka) poslat nevalidny JSON alebo vynechat required field. Preto validujeme:

```ts
// packages/agent-core/runtime/structured-output.ts
import Ajv from 'ajv';

function validateOutput(output: unknown, schema: JSONSchema): ValidationResult {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(output);

  if (!valid) {
    return {
      valid: false,
      errors: validate.errors,
    };
  }
  return { valid: true, data: output };
}
```

### Retry pri nevalidnom outpute

Ak validacia zlyhá, dáme agentovi jednu sancu opravit sa:

```ts
if (!validationResult.valid) {
  // Pridaj error feedback do conversation
  const retryMessage = {
    role: 'user',
    content: `Your output did not match the required schema.
Validation errors:
${JSON.stringify(validationResult.errors, null, 2)}

Please call the __output tool again with a corrected result.`,
  };

  // Pokracuj v execution s retry message
  // Agent dostane spatnu vazbu a zavola __output znova
}
```

Retry sa robi **maximalne 1x**. Ak aj druhy pokus zlyhá, execution prejde do fallback modu.

### Fallback: raw text output

Ak agent ani po retry nezvola `__output` s validnym outputom:

```ts
// Fallback response
{
  "structured": false,
  "raw": "Based on my analysis, this appears to be a high-priority bug...",
  "validationErrors": [...],
  "executionId": "exec_abc123"
}
```

Volajuci moze skontrolovat `structured` flag a rozhodnut sa ci raw text spracuje alebo oznaci execution ako failed.

## API response format

### Sync HTTP trigger — s output schemou

```json
// 200 OK
{
  "executionId": "exec_abc123",
  "status": "completed",
  "output": {
    "structured": true,
    "data": {
      "category": "bug",
      "priority": "high",
      "assignee": "jan.novak",
      "summary": "Login form crashes on Safari when using SSO"
    }
  },
  "usage": {
    "inputTokens": 3200,
    "outputTokens": 150,
    "cost": 0.012
  }
}
```

### Sync HTTP trigger — bez output schemy

```json
// 200 OK
{
  "executionId": "exec_abc123",
  "status": "completed",
  "output": {
    "structured": false,
    "raw": "I've analyzed the ticket and here are my findings..."
  },
  "usage": {
    "inputTokens": 3200,
    "outputTokens": 450,
    "cost": 0.018
  }
}
```

### Sync HTTP trigger — validacia zlyhala

```json
// 200 OK (execution uspesne dobehol, len output nema spravny tvar)
{
  "executionId": "exec_abc123",
  "status": "completed",
  "output": {
    "structured": false,
    "raw": "...",
    "validationErrors": [
      {
        "instancePath": "/priority",
        "message": "must be equal to one of the allowed values"
      }
    ]
  },
  "usage": { ... }
}
```

## UI: Output Schema Editor

V agent konfiguraci (settings tab) je vizualny editor output schemy.

### Rezimy editacie

1. **Visual builder** — drag-and-drop polia, vyber typov (string, number, boolean, enum, array, object). Generuje JSON Schema pod kapotou.

2. **JSON mode** — priamy JSON Schema editor s validaciou a autocomplete.

3. **Zod mode** — Zod schema syntax (pre power userov). Konvertuje sa do JSON Schema pred ulozenim.

```ts
// Zod definicia v UI
z.object({
  category: z.enum(['bug', 'feature', 'question', 'task']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  assignee: z.string().optional(),
  summary: z.string().max(200),
})
```

### Preview

Editor ukazuje **priklad outputu** generovany zo schemy, aby pouzivatel videl co agent vráti:

```json
// Generated example:
{
  "category": "bug",
  "priority": "high",
  "assignee": "user123",
  "summary": "Example summary text"
}
```

## Priklady output schem

### Klasifikacia ticketov

```json
{
  "type": "object",
  "properties": {
    "category": { "type": "string", "enum": ["bug", "feature", "question", "support"] },
    "priority": { "type": "string", "enum": ["p0", "p1", "p2", "p3"] },
    "sentiment": { "type": "string", "enum": ["positive", "neutral", "negative"] },
    "language": { "type": "string" },
    "requiresHumanReview": { "type": "boolean" }
  },
  "required": ["category", "priority", "sentiment"]
}
```

### Extrakcia dat z emailu

```json
{
  "type": "object",
  "properties": {
    "sender": { "type": "string" },
    "subject": { "type": "string" },
    "actionItems": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "task": { "type": "string" },
          "deadline": { "type": "string", "format": "date" },
          "assignee": { "type": "string" }
        },
        "required": ["task"]
      }
    },
    "isUrgent": { "type": "boolean" }
  },
  "required": ["sender", "actionItems", "isUrgent"]
}
```

### Sumarizacia s metadatami

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string", "maxLength": 500 },
    "keyPoints": {
      "type": "array",
      "items": { "type": "string" },
      "maxItems": 5
    },
    "topics": {
      "type": "array",
      "items": { "type": "string" }
    },
    "wordCount": { "type": "integer" },
    "confidenceScore": { "type": "number", "minimum": 0, "maximum": 1 }
  },
  "required": ["summary", "keyPoints"]
}
```

## Interakcia s inymi komponentmi

### Prompt caching (vid `24-prompt-caching.md`)

`__output` tool schema je sucast tool schemas bloku → cachuje sa spolu s ostatnymi tool schemami. Ziadny extra overhead.

### Context management (vid `22-context-management.md`)

`__output` tool call je typicky posledna akcia agenta — nepridava vyznamne k context window pressure.

### Safety (vid `23-agent-safety.md`)

`__output` je virtual tool — neexecutuje sa v sandbox-e, nema side effects. Tool tier: implicitne `safe`.
