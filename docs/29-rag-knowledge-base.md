# 29 — RAG & Knowledge Base

## Vize

Kazdy agent moze mat vlastnu **knowledge base** — sadu nahratych suborov (PDF, CSV, TXT, Markdown, obrazky s OCR), ktore su automaticky spracovane na prehladavatelne chunky s embeddings. Agent potom moze pri behu semanticky vyhladavat relevantne informacie cez interny MCP tool `knowledge__search`.

Ciel: agent nemusite krmit obrovsky system prompt. Namiesto toho mu date subory a on si najde co potrebuje. Toto je zaklad pre use-casy ako "firemna wiki", "support agent nad dokumentaciou", "analyst nad internymi reportmi".

---

## Architektura

### Ulozisko vektorov: pgvector v Postgres

Pouzivame **pgvector** extension v existujucej Postgres DB. Ziadna separatna infra.

Vyhody:
- Jeden zdroj pravdy — JOIN medzi chunks a ostatnymi tabulkami (agents, agent_files)
- Transakcie a konzistencia zadarmo
- Menej ops overhead (ziadny Pinecone/Qdrant cluster)

Obmedzenia:
- Pri extreme scale (>10M chunks napriec platformou) moze byt pomale — v tom pripade migracna cesta na dedicovany vector DB (vid nizzsie)

### Embedding model

Per-org nastavenie, ulozene v `orgs` tabulke:

| Column | Type | Notes |
|---|---|---|
| embedding_model | text | default `voyage-3`, alternativa `text-embedding-3-small` |
| embedding_dimensions | int | `1024` pre voyage-3, `1536` pre OpenAI |

Default: **Anthropic voyage-3** (1024 dims). Org admin moze zmenit na OpenAI `text-embedding-3-small`.

> Pozor: zmena modelu vyzaduje re-embedding vsetkych existujucich chunks pre dany org (BullMQ batch job).

---

## DB tabulky

### `file_chunks`

Hlavna tabulka pre RAG. Kazdy riadok = jeden chunk textu s jeho embedding vektorom.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| agent_file_id | uuid FK agent_files | odkaz na zdrojovy subor (vid `26-file-handling.md`) |
| agent_id | uuid FK agents | denormalizovane pre rychly WHERE filter |
| chunk_index | int | poradove cislo chunku v ramci suboru (0-based) |
| content | text | textovy obsah chunku |
| embedding | vector(1024) | pgvector typ, dimenzia podla embedding modelu |
| token_count | int | pocet tokenov v chunku (podla tokenizera modelu) |
| metadata | jsonb | `{ page?: number, section?: string, source_file: string }` |
| created_at | timestamptz | |

Indexy:
- `file_chunks_agent_id_idx` — B-tree na `agent_id` (WHERE filter pred vector search)
- `file_chunks_embedding_idx` — HNSW index pre ANN search (vid Performance sekcia)
- `file_chunks_agent_file_id_idx` — pre cascade delete pri re-uploade

### Vztah k `agent_files`

Tabulka `agent_files` je definovana v `26-file-handling.md`. Obsahuje metadata o nahratych suboroch (nazov, MIME type, S3 key, processing status). Kazdy `agent_file` moze mat 0..N `file_chunks`.

---

## Chunking strategia

Pouzivame **recursive text splitting** (inspirovane LangChain `RecursiveCharacterTextSplitter`):

```ts
const CHUNK_CONFIG = {
  maxTokens: 512,       // max velkost chunku
  overlapTokens: 50,    // prekrytie medzi po sebe iducimi chunkami
  separators: ["\n\n", "\n", ". ", " "],  // prioritny zoznam separatorov
};
```

Postup:
1. Subor sa spracuje na cisty text (PDF parser, CSV → tabular text, OCR pre obrazky) — vid `26-file-handling.md`
2. Text sa rekurzivne deli podla separatorov — najprv skusi `\n\n` (paragrafy), ak chunk > 512 tokenov, padne na `\n`, atd.
3. Kazdy chunk dostane overlap — poslednich 50 tokenov predchadzajuceho chunku sa pridava na zaciatok
4. Metadata (page, section) sa propaguju z parsera

---

## Embedding generovanie

### Pipeline (BullMQ)

Po uspesnom spracovani suboru (status `processed` v `agent_files`):

1. File processing worker emituje job `generate-embeddings` do BullMQ queue
2. Embedding worker nacita chunky pre dany `agent_file_id`
3. Batch API call na embedding endpoint (max 96 chunks per request pre voyage-3)
4. Ulozenie embedding vektorov do `file_chunks.embedding`
5. Update `agent_files.embedding_status` na `completed`

```ts
// Pseudocode embedding worker
async function processEmbeddingJob(job: Job<{ agentFileId: string }>) {
  const chunks = await db.select().from(fileChunks)
    .where(eq(fileChunks.agentFileId, job.data.agentFileId));

  const batches = chunk(chunks, 96);
  for (const batch of batches) {
    const embeddings = await embeddingClient.embed({
      model: org.embeddingModel,  // 'voyage-3' | 'text-embedding-3-small'
      input: batch.map(c => c.content),
    });

    await db.transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        await tx.update(fileChunks)
          .set({ embedding: embeddings[i] })
          .where(eq(fileChunks.id, batch[i].id));
      }
    });
  }
}
```

### Naklady

Embedding je lacny: ~$0.0001 za 1k tokenov (voyage-3). Ale pri 1000+ agentoch x viacero suborov sa to naklada. Preto:
- Sledujeme embedding cost per org v `usage_log` (analogicky k LLM cost tracking)
- Org admin vidi embedding naklady v analytics dashboarde
- Embedding sa generuje len raz (pokial sa subor nezmeni)

---

## Search: `knowledge__search` MCP tool

Interny MCP tool, automaticky dostupny kazdemu agentovi ktory ma aspon jeden subor v knowledge base.

### Tool definicia

```ts
{
  name: "knowledge__search",
  description: "Search agent's knowledge base using semantic similarity",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query in natural language" },
      limit: { type: "number", default: 5, description: "Max results (1-20)" },
      threshold: { type: "number", default: 0.7, description: "Min similarity score (0-1)" },
    },
    required: ["query"],
  },
}
```

### Implementacia

```sql
SELECT
  fc.content,
  fc.metadata,
  af.original_name AS source_file,
  1 - (fc.embedding <=> query_embedding) AS score
FROM file_chunks fc
JOIN agent_files af ON af.id = fc.agent_file_id
WHERE fc.agent_id = $1              -- cross-agent izolaciia!
  AND 1 - (fc.embedding <=> $2) >= $3  -- threshold
ORDER BY fc.embedding <=> $2
LIMIT $4;
```

### Navratova hodnota

```json
[
  {
    "content": "Chunk textovy obsah...",
    "score": 0.89,
    "source_file": "product-manual.pdf",
    "metadata": { "page": 12, "section": "Installation" }
  }
]
```

---

## Cross-agent izolaciia

Kriticke bezpecnostne pravidlo: agent moze **iba** prehladavat vlastne chunky.

- `file_chunks.agent_id` je denormalizovany z `agent_files.agent_id`
- Kazdy search query obsahuje `WHERE fc.agent_id = $currentAgentId`
- Tento filter je hardcoded v runtime — agent ho nemoze obist ani modifikovat
- RLS (Row Level Security) ako druha vrstva ochrany (Phase 5)

---

## Re-indexovanie

Ked sa subor re-uploadne alebo aktualizuje:

1. Vsetky existujuce chunky pre dany `agent_file_id` su zmazane (`DELETE FROM file_chunks WHERE agent_file_id = $1`)
2. Subor sa znova spracuje (parsing → chunking → embedding)
3. Nove chunky sa vlozza s novymi embedding vektormi

Toto je jednoduchsie nez diffing a garantuje konzistenciu.

---

## Performance

### Indexy pre pgvector

```sql
-- HNSW index pre approximate nearest neighbor (pgvector 0.7+)
CREATE INDEX file_chunks_embedding_hnsw_idx
  ON file_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- B-tree pre filtrovanie pred vector searchom
CREATE INDEX file_chunks_agent_id_idx ON file_chunks (agent_id);
```

HNSW vs IVFFlat: pouzivame HNSW lebo je rychlejsi na query time a nepotrebuje training step. Trade-off je pomalsie inserty a vacsia pamat, ale pre nas use-case (viac reads nez writes) je to idealne.

### Query performance ocakavania

- <10k chunks per agent: <50ms query time
- <1M chunks celkovo na platforme: HNSW zvladne bez problemov
- >10M chunks: zvazit dedicated vector DB

---

## Hybrid search (Phase 7+)

Kombinacia vector similarity s full-text search pre lepsie vysledky:

```sql
-- tsvector stlpec na file_chunks
ALTER TABLE file_chunks ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX file_chunks_tsv_idx ON file_chunks USING GIN (tsv);

-- Hybrid query: RRF (Reciprocal Rank Fusion)
WITH vector_results AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $2) AS vrank
  FROM file_chunks WHERE agent_id = $1
  LIMIT 20
),
text_results AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank(tsv, query) DESC) AS trank
  FROM file_chunks WHERE agent_id = $1 AND tsv @@ plainto_tsquery($3)
  LIMIT 20
)
SELECT fc.*, (1.0/(60+vr.vrank) + 1.0/(60+tr.trank)) AS rrf_score
FROM file_chunks fc
LEFT JOIN vector_results vr ON vr.id = fc.id
LEFT JOIN text_results tr ON tr.id = fc.id
WHERE vr.id IS NOT NULL OR tr.id IS NOT NULL
ORDER BY rrf_score DESC
LIMIT $4;
```

---

## Limity a migracna cesta

| Scale | Riesenie |
|---|---|
| <1M chunks | pgvector v Postgres — staci |
| 1M-10M chunks | pgvector s HNSW, dedicovany Postgres read replica pre search |
| >10M chunks | Migracna cesta: Qdrant alebo Pinecone. Adapter pattern — `VectorStore` interface s pgvector a external implementaciou |

Pgvector **nie je** nahrada za dedicovany vector DB pri extreme scale. Ale pre nasu ocakavanu velkost (1000 agentov, kazdy desiatky suborov) je to uplne dostatocne na roky.

---

## Phase plan

| Phase | Scope |
|---|---|
| Phase 2 | Zakladny RAG: upload suboru → chunking → embedding → `knowledge__search` tool |
| Phase 5 | Hybrid search (vector + full-text), RLS izolaciia |
| Phase 7 | Embedding cost tracking v analytics, bulk re-index UI |
| Phase 9 | Dedicated vector DB ak potrebne (Qdrant/Pinecone migration) |
