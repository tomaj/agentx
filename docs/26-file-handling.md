# 26 — File & Multimodal Handling

Agenti potrebuju pracovať s externými súbormi — PDF dokumenty, CSV dáta, obrázky, DOCX. Táto kapitola popisuje ako sa súbory uploadujú, spracovávajú a sprístupňujú agentom počas exekúcie.

## Use-case

Používateľ nahrá dokumenty k agentovi ako knowledge/kontext. Agent ich potom vie prehľadávať (sémantické vyhľadávanie), čítať priamo v sandboxe, alebo v prípade obrázkov dostane obsah ako multimodálny content block v prompte.

## Storage

Súbory sa **neukladajú do Postgres** (žiadne BLOBy). Používame S3-kompatibilný object store:

| Prostredie | Storage |
|---|---|
| Dev / self-hosted | **MinIO** (beží v docker-compose) |
| Produkcia | **AWS S3** (alebo kompatibilný — R2, DigitalOcean Spaces) |

Konfigurácia cez env premenné:

```env
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=agentx-files
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
```

## Databázový model

### `agent_files`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| agent_id | uuid FK agents | |
| org_id | uuid FK orgs | denormalizované pre RLS / filtrovanie |
| filename | text | pôvodný názov súboru |
| mime_type | text | `application/pdf`, `image/png`, … |
| size_bytes | bigint | |
| storage_key | text | S3 key, napr. `orgs/{org_id}/agents/{agent_id}/{uuid}.ext` |
| uploaded_by | uuid FK users | |
| processing_status | text | `pending` → `processing` → `done` / `error` |
| processed_at | timestamptz null | kedy spracovanie skončilo |
| created_at | timestamptz | |

### `file_chunks`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| file_id | uuid FK agent_files | |
| agent_id | uuid FK agents | pre rýchle query |
| chunk_index | int | poradie v rámci súboru |
| content | text | extrahovaný text chunk |
| embedding | vector(1536) | pgvector, text-embedding-3-small |
| metadata | jsonb | `{ page?: number, section?: string }` |
| created_at | timestamptz | |

Index: `HNSW` index na `embedding` stĺpec pre rýchle vyhľadávanie.

## Upload flow

```
UI upload → API (multipart/form-data)
  → validate (size, mime type)
  → stream do S3 (storage_key = orgs/{org_id}/agents/{agent_id}/{uuid}.ext)
  → INSERT do agent_files (status = 'pending')
  → enqueue BullMQ job 'file:process' { fileId }
  → return 201 s fileId + status
```

API endpoint:

```
POST /api/agents/:agentId/files
Content-Type: multipart/form-data

Response: { id, filename, status: "pending" }
```

## Processing pipeline

Každý súbor sa spracuje v BullMQ jobe `file:process`. Typ spracovania podľa MIME type:

### PDF (`application/pdf`)

1. Stiahni súbor z S3
2. Extrahuj text cez `pdf-parse`
3. Rozdeľ na chunky (max 1000 tokenov, overlap 200)
4. Pre každý chunk vygeneruj embedding cez OpenAI `text-embedding-3-small`
5. Ulož chunky do `file_chunks` s embeddingami
6. Nastav `processing_status = 'done'`

### CSV (`text/csv`)

1. Parsuj hlavičky + prvých N riadkov (default 100) cez `csv-parse`
2. Ulož štrukturovaný preview ako jeden chunk (JSON formát)
3. Celý CSV ostáva dostupný ako raw súbor v sandboxe

### Obrázky (`image/*`)

1. Validuj formát (PNG, JPEG, WebP, GIF)
2. Žiadna extrakcia textu — obrázky sa posielajú priamo Claude ako content blocks
3. Nastav `processing_status = 'done'` ihneď
4. Voliteľne: resize ak > 5MB (sharp)

### DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)

1. Konvertuj na čistý text cez `mammoth`
2. Rozdeľ na chunky rovnako ako PDF
3. Generuj embeddingy, ulož do `file_chunks`

### Fallback

Neznáme typy: nastav `processing_status = 'unsupported'`. Súbor ostáva dostupný ako raw v sandboxe, ale bez sémantického vyhľadávania.

## Prístup agenta k súborom počas exekúcie

Agent má tri spôsoby ako pracovať so súbormi:

### 1. Sémantické vyhľadávanie — `knowledge__search` MCP tool

Interný MCP tool, automaticky dostupný každému agentovi, ktorý má nahrané súbory.

```json
{
  "name": "knowledge__search",
  "description": "Search agent's uploaded knowledge base",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "max_results": { "type": "number", "default": 5 }
    }
  }
}
```

Implementácia: query embedding → cosine similarity nad `file_chunks` s filtrom `agent_id`. Vráti top-K chunkov s metadátami (názov súboru, strana, skóre).

### 2. Priamy prístup k súborom v Docker sandboxe

Raw súbory sa mountujú do Docker sandboxu na cestu `/workspace/files/`:

```
/workspace/files/
  report-q4.pdf
  data.csv
  screenshot.png
```

Agent môže použiť file-system MCP tools (`filesystem__read_file`, `filesystem__list_directory`) na priamy prístup. Užitočné pre CSV analýzu, generovanie grafov z dát atď.

### 3. Multimodálne content blocks (obrázky)

Ak je v agent config zapnuté `injectImages: true`, obrázky sa pred exekúciou vložia priamo do promptu ako content blocks:

```typescript
{
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/png',
    data: '<base64>'
  }
}
```

Limit: max 5 obrázkov v prompte (konfigurovateľné). Väčšie množstvo je dostupné cez sandbox.

## UI — správa súborov

Na stránke agenta záložka **Files** s funkciami:

- **Upload** — drag & drop alebo file picker, progress bar
- **Zoznam** — tabuľka: názov, typ, veľkosť, status spracovania, dátum nahratia
- **Delete** — odstráni S3 objekt + DB záznamy (agent_files + file_chunks)
- **Status** — `pending` / `processing` / `done` / `error` / `unsupported` s ikonou

Real-time update statusu cez SSE (rovnaký mechanizmus ako execution events).

## Limity a retencia

| Parameter | Default | Konfigurovateľné |
|---|---|---|
| Max veľkosť jedného súboru | 50 MB | per-org |
| Max celková veľkosť per agent | 500 MB | per-org |
| Max počet súborov per agent | 100 | per-org |
| Retencia spracovaných chunkov | 90 dní | per-org |
| Retencia raw súborov | bez expirácie (kým user nezmaže) | — |

Čistenie chunkov: cron job `file-chunks:cleanup` beží denne, maže chunky staršie ako retenčná doba.

## Bezpečnosť

- **Org-scoped izolácia** — agent vie pristúpiť iba k svojim vlastným súborom. Query vždy filtruje podľa `agent_id` + `org_id`.
- **S3 keys nie sú exponované** — agent nikdy nevidí `storage_key` ani S3 credentials. Prístup je vždy cez interné API alebo mount v sandboxe.
- **Upload validácia** — MIME type check (whitelist), antivírus scan (voliteľné, cez ClamAV v produkcii).
- **Sandbox mount je read-only** — agent nemôže modifikovať uploadnuté súbory.
- **Presigned URLs** — pre download z UI sa generujú krátkodobé presigned URLs (15 min expiry).

## Drizzle schéma (ukážka)

```typescript
export const agentFiles = pgTable('agent_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  storageKey: text('storage_key').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  processingStatus: text('processing_status').notNull().default('pending'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fileChunks = pgTable('file_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').notNull().references(() => agentFiles.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```
