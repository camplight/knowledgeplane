# KnowledgePlane Discovery Report

**Date:** 2026-02-12
**Objective:** Document ingestion and query mechanisms for adapter implementation

---

## Section 1: Document Ingestion

### 1.1 File Upload API (MCP Tool: `files_upload`)

**Location:** `/Users/altras/home/dev/knowledgeplane/apps/mcp-server/src/mcp/handlers/files.upload.ts`

**Interface:**
```typescript
async function handleFilesUpload(args: {
  filename: string;
  mimeType: string;
  data: string; // Base64 encoded
  workspace_id?: string; // Injected from context
  created_by?: string;   // Injected from context
})
```

**Supported Formats:**
- PDF files (via base64 + OpenAI file input)
- Excel files (.xlsx only, converted to text)
- Text files (JSON, markdown, plain text, etc.)
- All other formats (attempted as UTF-8 text)

**Processing Flow:**
1. Base64 decode file data
2. Call `processFileUpload()` from `@knowledgeplane/file-processor`
3. Creates `File` record in database (metadata only, no actual file storage)
4. Extracts facts and relations via AI (`extractFactsAndRelationsFromFile`)
5. Stores facts in `facts` collection
6. Creates relations in `relations` edge collection
7. Links facts back to file via metadata

**Implementation:**
```typescript
// File: packages/file-processor/src/process-file.ts
export async function processFileUpload(options: ProcessFileOptions): Promise<ProcessFileResult> {
  // 1. Create file metadata record
  const fileRecord = await File.create({...});

  // 2. Extract facts & relations using AI
  const { facts, relations } = await extractFactsAndRelationsFromFile(buffer, filename, mimeType, {...});

  // 3. Create fact records
  const createdFacts = await Promise.all(facts.map(fact => Fact.write({...})));

  // 4. Create relation records
  for (const relation of relations) {
    await FactRelation.create({...});
  }

  // 5. Update file with fact IDs
  await File.update({
    id: fileRecord.id,
    fact_ids: createdFacts.map(f => f.id),
    ...
  });

  return {
    file: {...},
    factsCreated: createdFacts.length,
    relationsCreated: createdRelations.length,
    facts: createdFacts.map(f => ({ id: f.id, content: f.content }))
  };
}
```

**AI Extraction:**
- Uses OpenAI (or Anthropic/Google) via configurable provider
- System prompt guides extraction of facts and relations
- Returns structured JSON: `{ facts: [...], relations: [...] }`
- Each fact has: `content`, `metadata`
- Each relation has: `from_content`, `to_content`, `type`, `metadata`

### 1.2 Direct Fact Writing (MCP Tool: `facts_write`)

**Location:** `/Users/altras/home/dev/knowledgeplane/apps/mcp-server/src/mcp/handlers/facts.write.ts`

**Interface:**
```typescript
async function handleFactsWrite(args: {
  content: string;
  metadata?: Record<string, string>;
  workspace_id?: string;    // Injected from context
  created_by?: string;       // Injected from context
  last_updated_by?: string;  // Injected from context
})
```

**Database Model:**
```typescript
// File: packages/db/src/models/Fact.ts
interface FactRecord {
  _key?: string;
  _id?: string;
  id: string;                          // Public ID
  content: string;                     // The actual fact text
  metadata: Record<string, string>;
  workspace_id: string;                // Workspace isolation
  created_at: string;
  updated_at: string;
  created_by: string;
  last_updated_by: string;
  deleted_by?: string | null;
  deleted_at?: string | null;
  trashed: boolean;
  embedding?: number[];                // Vector embedding (1536-dim)
  embedding_model?: string;            // e.g., "text-embedding-3-small"
}

static async write(input: FactInput): Promise<FactRecord> {
  const doc = {
    content: input.content,
    metadata: input.metadata || {},
    workspace_id: input.workspace_id,
    created_by: input.created_by,
    last_updated_by: input.last_updated_by,
    trashed: false,
    created_at: now,
    updated_at: now,
  };

  const result = await collections.facts.save(doc, { returnNew: true });
  const record = this._normalizeRecord(result.new!);

  // Trigger webhook
  triggerWebhook("fact.created", record);

  return record;
}
```

### 1.3 Bulk Fact Writing (MCP Tool: `facts_bulkwrite`)

**Interface:**
```typescript
async function handleFactsBulkWrite(args: {
  facts: Array<{
    content: string;
    metadata?: Record<string, string>;
  }>;
  workspace_id?: string;    // Injected from context
  created_by?: string;       // Injected from context
  last_updated_by?: string;  // Injected from context
})
```

Uses `Fact.bulkWrite()` which performs batch insert into ArangoDB.

### 1.4 Namespace Isolation

**Workspace-Based Isolation:**
- Every fact, relation, and knowledge card belongs to a `workspace_id`
- The `workspace_id` is **never** accepted from tool arguments (security)
- Always injected from authenticated session context via `McpContext`
- Enforced at the MCP server layer in `server.ts` via `prepareHandlerArgs()`

**Context Injection:**
```typescript
// File: apps/mcp-server/src/mcp/server.ts
function prepareHandlerArgs(args: any, context: McpContext | undefined, options: PrepareArgsOptions): any {
  // 1. Remove workspace_id from args (never from user)
  const { workspace_id, ...cleanedArgs } = args;

  // 2. Set workspace_id from context (authenticated session)
  if (context?.workspaceId) {
    preparedArgs.workspace_id = context.workspaceId;
  }

  // 3. Optionally set user-related fields
  if (context?.userId) {
    if (setCreatedBy && !preparedArgs.created_by) {
      preparedArgs.created_by = context.userId;
    }
  }

  return preparedArgs;
}
```

---

## Section 2: Query Interface

### 2.1 Fact Search (MCP Tool: `facts_search`)

**Location:** `/Users/altras/home/dev/knowledgeplane/apps/mcp-server/src/mcp/handlers/facts.search.ts`

**Interface:**
```typescript
async function handleFactsSearch(args: {
  query: string;              // Search query or "*" for all
  k?: number;                 // Max results (default: 5, max: 20)
  offset?: number;            // Pagination offset
  include_trashed?: boolean;
  workspace_id?: string;      // Injected from context
})
```

**Implementation:**
```typescript
// File: packages/api-core/src/index.ts
export async function searchFacts(args: {
  query: string;
  workspace_id?: string;
  k?: number;
  offset?: number;
  include_trashed?: boolean;
}): Promise<{
  hits: Array<FactRecord & { content_truncated?: boolean }>;
  total_returned: number;
  limit_used: number;
  note?: string;
}> {
  const provider = getProvider();
  const limit = Math.min(args.k || 5, 20);
  const maxContentLength = 500;

  // Delegates to Fact.search()
  const hits = await Fact.search({
    query: args.query,
    workspace_id: args.workspace_id,
    k: limit,
    offset: args.offset,
    include_trashed: args.include_trashed,
    use_vector_search: undefined, // Hybrid by default
    embeddingProvider: provider,
  });

  // Truncate long content
  const optimizedHits = hits.map((hit) => {
    const content = hit.content.length > maxContentLength
      ? hit.content.substring(0, maxContentLength) + "..."
      : hit.content;
    return {
      ...hit,
      content,
      content_truncated: hit.content.length > maxContentLength,
    };
  });

  return {
    hits: optimizedHits,
    total_returned: optimizedHits.length,
    limit_used: limit,
    note: optimizedHits.some(h => h.content_truncated)
      ? "Some facts have truncated content. Fetch the fact by ID for full content."
      : undefined,
  };
}
```

**Search Modes:**
```typescript
// File: packages/db/src/models/Fact.ts
static async search(params: FactSearchParams): Promise<FactSearchResult[]> {
  const useVectorSearch = params.use_vector_search;
  const isWildcard = params.query === "*";

  // 1. Full-text only (use_vector_search: false or wildcard query)
  if (useVectorSearch === false || isWildcard) {
    return this._fullTextSearch(params);
  }

  // 2. Vector-only (use_vector_search: true)
  if (useVectorSearch === true) {
    return this._vectorSearch(params);
  }

  // 3. Hybrid (default, use_vector_search: undefined)
  return this._hybridSearch(params);
}
```

**Full-Text Search:**
- Uses ArangoDB FULLTEXT index on `content` field
- Falls back to LIKE search if index doesn't exist
- Filters by `workspace_id` and `trashed` status
- Returns BM25-style relevance scores (fallback: 1.0)

**Vector Search:**
- Generates query embedding via AI provider (OpenAI/Anthropic/Google)
- Fetches all facts with embeddings (1536-dim vectors)
- Computes cosine similarity in-memory
- Sorts by similarity score
- Handles dimension mismatches gracefully

**Hybrid Search:**
- Runs full-text and vector search in parallel
- Fetches 2x results from each
- Deduplicates and averages scores
- Sorts by combined score

**Wildcard Query:**
- Query `"*"` returns all facts (sorted by updated_at DESC)
- No semantic search, just retrieval

### 2.2 Knowledge Card Search (MCP Tool: `knowledge_cards_search`)

**Location:** `/Users/altras/home/dev/knowledgeplane/apps/mcp-server/src/mcp/handlers/knowledge_cards.search.ts`

**Interface:**
```typescript
async function handleKnowledgeCardsSearch(args: {
  query: string;
  k?: number;
  offset?: number;
  use_vector_search?: boolean;
  workspace_id?: string;  // Injected from context
})
```

**Implementation:**
```typescript
// File: packages/api-core/src/index.ts
export async function searchKnowledgeCards(args: {
  query: string;
  workspace_id?: string;
  k?: number;
  offset?: number;
  use_vector_search?: boolean;
}): Promise<KnowledgeCardSearchResult[]> {
  const limit = args.k || 5;
  const offset = args.offset || 0;
  const isWildcard = args.query === "*";
  const provider = getProvider();

  if (args.use_vector_search === false || isWildcard) {
    return knowledgeCardsFullTextSearch(args.query, args.workspace_id, limit, offset);
  }

  if (args.use_vector_search === true) {
    return knowledgeCardsVectorSearch(args.query, args.workspace_id, limit, offset, provider);
  }

  return knowledgeCardsHybridSearch(args.query, args.workspace_id, limit, offset, provider);
}
```

Same search modes as facts (full-text, vector, hybrid).

**Knowledge Card Structure:**
```typescript
interface KnowledgeCardRecord {
  id: string;
  title: string;              // Max 100 chars
  summary: string;            // 2-3 sentences, max 200 chars
  content: string;            // Full consolidated content
  fact_ids: string[];         // References to source facts
  workspace_id: string;
  created_by: string;
  last_updated_by: string;
  created_by_worker?: string | null;    // e.g., "card-consolidator"
  last_updated_by_worker?: string | null;
  deleted_by?: string | null;
  deleted_at?: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  embedding?: number[];       // Based on title + summary + content
  embedding_model?: string;
}
```

### 2.3 Graph Queries (Fact Relations)

**MCP Tools:**
- `fact_relations_search` - Search relations by type/workspace
- `fact_relations_get_related` - Get outgoing relations from a fact
- `fact_relations_get_incoming` - Get incoming relations to a fact

**Example: Get Related Facts**
```typescript
// File: packages/db/src/models/FactRelation.ts
static async getRelatedFacts(
  factId: string,
  relationType?: string,
): Promise<{ relation: FactRelationRecord; fact: any }[]> {
  const aql = `
    FOR relation IN relations
      FILTER relation._from == @factId
      FILTER relation.deleted_at == null
      ${relationType ? "FILTER relation.type == @type" : ""}
      LET fact = DOCUMENT(relation._to)
      FILTER fact != null AND fact.content != null
      RETURN { relation: relation, fact: fact }
  `;

  const cursor = await collections.relations.database.query(aql, bindVars);
  const results = await cursor.all();

  // Returns array of { relation, fact } pairs
  return validResults;
}
```

**Relation Types:**
- `references` - Source references target
- `depends_on` - Source depends on target
- `related_to` - General relation
- `part_of` - Source is part of target
- `causes` - Source causes target
- `enables` - Source enables target
- `contradicts` - Source contradicts target
- `supports` - Source supports target

---

## Section 3: Data Model & Storage

### 3.1 Database: ArangoDB

**Connection:**
- URL: `process.env.ARANGO_URL` (default: `http://localhost:8529`)
- Database: `process.env.ARANGO_DB_NAME` (default: `knowledgeplane`)
- User: `process.env.ARANGO_USER` (default: `root`)
- Password: `process.env.ARANGO_PASSWORD` (default: `root`)

**Collections:**
```typescript
// File: packages/db/src/db.ts
export const collections = {
  users: db.collection("users"),
  facts: db.collection("facts"),                      // Document collection
  relations: db.collection("relations"),              // Edge collection
  knowledge_cards: db.collection("knowledge_cards"),  // Document collection
  files: db.collection("files"),
  workspaces: db.collection("workspaces"),
  workspace_members: db.collection("workspace_members"),
  webhooks: db.collection("webhooks"),
  worker_logs: db.collection("worker_logs"),
  worker_triggers: db.collection("worker_triggers"),
  chat_threads: db.collection("chat_threads"),
  chat_messages: db.collection("chat_messages"),
  data_sources: db.collection("data_sources"),
  invitations: db.collection("invitations"),
  oauth_authorization_requests: db.collection("oauth_authorization_requests"),
  oauth_authorization_codes: db.collection("oauth_authorization_codes"),
};

// Graph for relations
export const knowledgeGraph = db.graph("knowledge_graph");
```

### 3.2 Graph Structure

**Knowledge Graph:**
- **Vertices:** `facts` collection
- **Edges:** `relations` collection
- **Graph Name:** `knowledge_graph`

```typescript
// Graph definition
await knowledgeGraph.create([
  {
    collection: "relations",
    from: ["facts"],
    to: ["facts"],
  },
]);
```

**Edge Format:**
```typescript
interface FactRelationRecord {
  _from: string;        // Source fact document ID (e.g., "facts/123")
  _to: string;          // Target fact document ID (e.g., "facts/456")
  from_fact: string;    // Normalized fact ID for application logic
  to_fact: string;      // Normalized fact ID for application logic
  type: string;         // Relation type
  workspace_id: string; // Workspace isolation
  metadata: Record<string, any>;
  created_by: string;
  created_at: string;
  last_updated_by: string;
  updated_at: string;
  deleted_by?: string | null;
  deleted_at?: string | null;
  embedding?: number[];
  embedding_model?: string;
}
```

### 3.3 Indexes

**Fact Indexes:**
- `idx_fact_workspace_id` (persistent)
- `idx_fact_created_by` (persistent)
- `idx_fact_trashed` (persistent)
- `idx_fact_content_fulltext` (fulltext on `content`, minLength: 3)
- `idx_fact_embedding_vector` (vector, cosine, 1536-dim, nLists: 100)

**Relation Indexes:**
- `idx_relation_from` (persistent on `from_fact`)
- `idx_relation_to` (persistent on `to_fact`)
- `idx_relation_type` (persistent)
- `idx_relation_workspace_id` (persistent)
- `idx_relation_embedding_vector` (vector, cosine, 1536-dim)

**Knowledge Card Indexes:**
- `idx_knowledge_card_workspace_id` (persistent)
- `idx_knowledge_card_embedding_vector` (vector, cosine, 1536-dim, adaptive nLists)

### 3.4 Vector Search

**Embedding Generation:**
```typescript
// File: packages/db/src/lib/vector-search.ts
export async function generateQueryEmbedding(query: string, provider: AIModelProvider): Promise<number[]> {
  const response = await provider.embeddings({
    input: query,
    model: "text-embedding-3-small", // 1536 dimensions
  });

  return response.data[0].embedding;
}

export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  // Validates dimensions match
  // Computes dot product and magnitudes
  // Returns similarity score (0-1)
  const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
  const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));

  return dotProduct / (magnitude1 * magnitude2);
}
```

**Provider Support:**
- OpenAI (text-embedding-3-small, text-embedding-3-large)
- Anthropic (via embeddings API)
- Google (via embeddings API)
- Configurable via `process.env.AI_PROVIDER`

---

## Section 4: Proposed Adapter Interface

Based on the analysis, here's the recommended adapter interface for the benchmark framework:

### 4.1 Ingestion Adapter

```typescript
interface KnowledgePlaneIngestionAdapter {
  // Initialize connection
  initialize(config: {
    mcpUrl: string;           // e.g., "http://localhost:8080/mcp"
    apiKey: string;           // Authentication token
    workspaceId: string;      // Target workspace
    userId: string;           // User for created_by fields
  }): Promise<void>;

  // Ingest a document (file upload simulation)
  ingestDocument(doc: {
    filename: string;
    content: string;          // Raw text or base64
    mimeType: string;         // e.g., "text/plain", "application/json"
    metadata?: Record<string, string>;
  }): Promise<{
    fileId: string;
    factsCreated: number;
    relationsCreated: number;
    factIds: string[];
  }>;

  // Ingest raw facts (direct fact writing)
  ingestFacts(facts: Array<{
    content: string;
    metadata?: Record<string, string>;
  }>): Promise<{
    factIds: string[];
  }>;

  // Create relations between facts
  createRelations(relations: Array<{
    fromFactId: string;
    toFactId: string;
    type: string;
    metadata?: Record<string, any>;
  }>): Promise<{
    relationIds: string[];
  }>;
}
```

### 4.2 Query Adapter

```typescript
interface KnowledgePlaneQueryAdapter {
  // Initialize connection (same as ingestion)
  initialize(config: {
    mcpUrl: string;
    apiKey: string;
    workspaceId: string;
    userId: string;
  }): Promise<void>;

  // Query facts with various search modes
  queryFacts(query: {
    query: string;
    k?: number;               // Max results
    offset?: number;          // Pagination
    searchMode?: "fulltext" | "vector" | "hybrid";
    includeTrashed?: boolean;
  }): Promise<{
    results: Array<{
      id: string;
      content: string;
      score: number;
      metadata: Record<string, string>;
      created_at: string;
    }>;
    totalReturned: number;
    queryTime: number;        // Milliseconds
  }>;

  // Query knowledge cards
  queryKnowledgeCards(query: {
    query: string;
    k?: number;
    offset?: number;
    searchMode?: "fulltext" | "vector" | "hybrid";
  }): Promise<{
    results: Array<{
      id: string;
      title: string;
      summary: string;
      content: string;
      factIds: string[];
      score: number;
      created_at: string;
    }>;
    totalReturned: number;
    queryTime: number;
  }>;

  // Get related facts (graph traversal)
  getRelatedFacts(factId: string, relationType?: string): Promise<{
    relations: Array<{
      relationId: string;
      relationType: string;
      fact: {
        id: string;
        content: string;
        metadata: Record<string, string>;
      };
    }>;
  }>;

  // Get incoming relations (reverse graph traversal)
  getIncomingRelations(factId: string, relationType?: string): Promise<{
    relations: Array<{
      relationId: string;
      relationType: string;
      fact: {
        id: string;
        content: string;
        metadata: Record<string, string>;
      };
    }>;
  }>;
}
```

### 4.3 Implementation Approach

**Using MCP Client:**
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

class KnowledgePlaneAdapter implements KnowledgePlaneIngestionAdapter, KnowledgePlaneQueryAdapter {
  private client: Client;
  private config: AdapterConfig;

  async initialize(config: AdapterConfig): Promise<void> {
    this.config = config;

    // Create MCP client with SSE transport
    this.client = new Client({
      name: "kp-benchmark-adapter",
      version: "1.0.0",
    }, {
      capabilities: {},
    });

    const transport = new SSEClientTransport(
      new URL(config.mcpUrl),
      {
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
        },
      }
    );

    await this.client.connect(transport);
  }

  async ingestDocument(doc: DocumentInput): Promise<IngestResult> {
    const startTime = Date.now();

    // Base64 encode content
    const base64Data = Buffer.from(doc.content).toString("base64");

    // Call files_upload tool
    const result = await this.client.callTool({
      name: "files_upload",
      arguments: {
        filename: doc.filename,
        mimeType: doc.mimeType,
        data: base64Data,
      },
    });

    const parsed = JSON.parse(result.content[0].text);

    return {
      fileId: parsed.file.id,
      factsCreated: parsed.factsCreated,
      relationsCreated: parsed.relationsCreated,
      factIds: parsed.facts.map(f => f.id),
      ingestionTime: Date.now() - startTime,
    };
  }

  async queryFacts(query: QueryInput): Promise<QueryResult> {
    const startTime = Date.now();

    // Determine use_vector_search parameter
    let useVectorSearch: boolean | undefined;
    if (query.searchMode === "fulltext") useVectorSearch = false;
    else if (query.searchMode === "vector") useVectorSearch = true;
    else useVectorSearch = undefined; // hybrid

    // Call facts_search tool
    const result = await this.client.callTool({
      name: "facts_search",
      arguments: {
        query: query.query,
        k: query.k || 5,
        offset: query.offset || 0,
        include_trashed: query.includeTrashed || false,
        // Note: use_vector_search is not exposed in MCP tool
        // It always uses hybrid search by default
        // For benchmarking, you may need to patch the API
      },
    });

    const parsed = JSON.parse(result.content[0].text);

    return {
      results: parsed.hits.map(hit => ({
        id: hit.id,
        content: hit.content,
        score: hit.score || 1.0,
        metadata: hit.metadata || {},
        created_at: hit.created_at,
      })),
      totalReturned: parsed.total_returned,
      queryTime: Date.now() - startTime,
    };
  }
}
```

---

## Section 5: Gaps & TODOs

### 5.1 Missing Features

**1. Direct Search Mode Control**
- The MCP tools don't expose `use_vector_search` parameter
- Always uses hybrid search (default behavior)
- **Workaround:** Modify `packages/api-core/src/index.ts` to add parameter
- **Alternative:** Call REST API directly (if available)

**2. No Answer Generation**
- KnowledgePlane stores and retrieves facts/cards
- Does NOT generate natural language answers from retrieved context
- **Gap:** Benchmark expects "answer" field with synthesized response
- **TODO:** Add answer generation layer (call LLM with retrieved context)

**3. No Citation/Source Tracking in Responses**
- Search results include fact IDs and metadata
- But no automatic citation formatting (e.g., "[1]", "[2]")
- **TODO:** Build citation formatter based on returned fact IDs

**4. Background Consolidation**
- Knowledge cards are created asynchronously by `card-consolidator` worker
- Worker runs every 5 minutes
- Manual trigger via `worker_triggers` collection
- **Gap:** No immediate consolidation on demand
- **TODO:** Add synchronous consolidation endpoint or trigger worker manually

### 5.2 Authentication & Session

**Current State:**
- MCP tools expect `workspace_id` and `userId` in session context
- Context is injected via `McpContext` in server
- HTTP transport: Uses JWT tokens or API keys
- Stdio transport: No authentication (local only)

**For Benchmarking:**
- Need to create workspace and user first
- Obtain API key or JWT token
- Pass via Authorization header: `Bearer <token>`

**Setup Steps:**
```typescript
// 1. Create workspace (via webapp or direct DB insert)
const workspace = await Workspace.create({
  slug: "benchmark-workspace",
  name: "Benchmark Workspace",
  created_by: "system",
});

// 2. Create user (if not exists)
const user = await User.create({
  username: "benchmark-user",
  api_key: "benchmark-api-key-12345",
});

// 3. Add user to workspace
await WorkspaceMember.create({
  workspace_id: workspace.id,
  user_id: user.id,
  role: "admin",
});

// 4. Use in adapter
await adapter.initialize({
  mcpUrl: "http://localhost:8080/mcp",
  apiKey: "benchmark-api-key-12345",
  workspaceId: workspace.id,
  userId: user.id,
});
```

### 5.3 Performance Considerations

**Vector Search:**
- In-memory cosine similarity computation (not using ArangoDB native vector index)
- Loads all facts with embeddings into memory
- **Impact:** May be slow for large fact collections (>10k)
- **TODO:** Consider using ArangoDB APPROX_NEAR_COSINE for native vector search

**Hybrid Search:**
- Runs full-text and vector search in parallel
- Fetches 2x results from each (for deduplication)
- **Impact:** 2x query cost, but better relevance

**Content Truncation:**
- Search results truncate content to 500 chars
- Optimization to reduce response size
- **Note:** Full content requires separate fetch by ID

### 5.4 Missing Test Coverage

**Existing Tests:**
- Unit tests for fact write/search handlers (mocked)
- No integration tests found
- No end-to-end tests with real database

**TODO for Adapter:**
- Create integration test suite
- Test all ingestion paths (file upload, direct write, bulk write)
- Test all query modes (fulltext, vector, hybrid)
- Test graph traversal (relations)
- Test error handling and edge cases

### 5.5 Mock Requirements

**For Benchmarking Without Real KP Instance:**

**Mock Ingestion:**
```typescript
class MockKnowledgePlaneAdapter {
  private facts: Map<string, Fact> = new Map();
  private relations: Map<string, Relation> = new Map();
  private knowledgeCards: Map<string, KnowledgeCard> = new Map();

  async ingestDocument(doc: DocumentInput): Promise<IngestResult> {
    // 1. Simulate AI extraction (parse text into sentences)
    const sentences = doc.content.split(/[.!?]+/).filter(s => s.trim());
    const factIds = [];

    for (const sentence of sentences) {
      const factId = `fact_${Math.random().toString(36).substr(2, 9)}`;
      this.facts.set(factId, {
        id: factId,
        content: sentence.trim(),
        metadata: doc.metadata || {},
        created_at: new Date().toISOString(),
        embedding: this.generateRandomEmbedding(), // Mock embedding
      });
      factIds.push(factId);
    }

    // 2. Create mock relations (connect adjacent facts)
    const relationIds = [];
    for (let i = 0; i < factIds.length - 1; i++) {
      const relationId = `rel_${Math.random().toString(36).substr(2, 9)}`;
      this.relations.set(relationId, {
        id: relationId,
        from_fact: factIds[i],
        to_fact: factIds[i + 1],
        type: "related_to",
        created_at: new Date().toISOString(),
      });
      relationIds.push(relationId);
    }

    return {
      fileId: `file_${Math.random().toString(36).substr(2, 9)}`,
      factsCreated: factIds.length,
      relationsCreated: relationIds.length,
      factIds,
    };
  }

  async queryFacts(query: QueryInput): Promise<QueryResult> {
    // Simple keyword matching or random selection
    const results = [];
    const queryLower = query.query.toLowerCase();

    for (const [id, fact] of this.facts) {
      if (fact.content.toLowerCase().includes(queryLower)) {
        results.push({
          id: fact.id,
          content: fact.content,
          score: Math.random(), // Mock score
          metadata: fact.metadata,
          created_at: fact.created_at,
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return {
      results: results.slice(0, query.k || 5),
      totalReturned: results.length,
      queryTime: Math.random() * 100, // Mock time
    };
  }

  private generateRandomEmbedding(): number[] {
    return Array.from({ length: 1536 }, () => Math.random() - 0.5);
  }
}
```

---

## Summary

### Key Findings

1. **Ingestion is well-structured** with multiple entry points (file upload, direct write, bulk write)
2. **Query system supports 3 modes** (fulltext, vector, hybrid) but MCP tools don't expose mode selection
3. **Workspace isolation is enforced** at the MCP server layer via context injection
4. **Graph structure exists** for fact relations with traversal queries
5. **Background consolidation** creates knowledge cards asynchronously
6. **Vector embeddings** are supported but computed in-memory (not native ArangoDB)

### Immediate Actions

1. **Create adapter classes** following the proposed interfaces
2. **Set up test workspace** and user for benchmarking
3. **Add answer generation layer** (KP doesn't synthesize answers, only retrieves)
4. **Add citation formatting** for returned facts
5. **Mock adapter** for benchmarking without real KP instance
6. **Document API limitations** (no search mode control in MCP tools)

### Next Steps

1. Implement `KnowledgePlaneIngestionAdapter`
2. Implement `KnowledgePlaneQueryAdapter`
3. Create integration test suite
4. Add benchmarking scenarios (latency, throughput, accuracy)
5. Compare with other KG systems (GraphRAG, etc.)

---

**End of Report**
