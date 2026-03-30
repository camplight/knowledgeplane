import { Database } from "arangojs";
import "dotenv/config";
import { fetch as undiciFetch } from "undici";
import type { BodyInit, RequestInfo, RequestInit, Response } from "undici";

const dbUrl = process.env.ARANGO_URL || "http://localhost:8529";
const dbName = process.env.ARANGO_DB_NAME || "knowledgeplane";
const dbUser = process.env.ARANGO_USER || "root";
const dbPassword = process.env.ARANGO_PASSWORD || "root";

// Ensure we use Node.js fetch (undici), not browser fetch or Next.js polyfills
// ArangoDB requires Content-Length header and doesn't support Transfer-Encoding: chunked
// Next.js route handlers may use a fetch implementation that uses chunked encoding
// By patching global fetch to use undici.fetch in server environments, we ensure
// arangojs uses the correct fetch implementation that sends Content-Length headers
// @ts-ignore-next-line: 'window' may be undefined in Node
const isServer = typeof window === "undefined";

// Helper function to convert a body to a buffer/string for Content-Length calculation
// This ensures undici.fetch can set Content-Length header instead of using chunked encoding
async function normalizeBody(body: BodyInit | null): Promise<BodyInit | null> {
  if (body === null || body === undefined) {
    return null;
  }

  // If it's already a string or Buffer, return as-is
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Buffer) {
    return new Uint8Array(body);
  }

  // If it's a ReadableStream, read it fully and convert to Buffer
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Concatenate all chunks into a single buffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  // If it's an ArrayBuffer or ArrayBufferView, convert to Uint8Array
  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  // For other types (FormData, Blob, etc.), pass through and let undici handle it
  // These should be rare for arangojs use cases
  return body as any;
}

// Create a wrapper around undici.fetch that handles Request objects properly
// undici.fetch may not handle Request objects the same way as standard fetch,
// so we extract the URL and options from Request objects before passing them to undici.fetch
// We also normalize the body to ensure Content-Length headers are sent instead of chunked encoding
const createUndiciFetchWrapper = () => {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Helper to calculate Content-Length for normalized body
    const getContentLength = (body: BodyInit | null): number | undefined => {
      if (body === null || body === undefined) {
        return undefined;
      }
      if (typeof body === "string") {
        return Buffer.byteLength(body, "utf8");
      }
      if (body instanceof Buffer) {
        return body.length;
      }
      if (body instanceof Uint8Array) {
        return body.length;
      }
      if (body instanceof ArrayBuffer) {
        return body.byteLength;
      }
      if (ArrayBuffer.isView(body)) {
        return body.byteLength;
      }
      return undefined;
    };

    // If input is a Request object, extract URL and options
    if (input instanceof Request) {
      const url = input.url;

      // Build options from Request object
      // Copy headers to a plain object to avoid issues with Headers object
      const headersObj: Record<string, string> = {};
      if (input.headers) {
        input.headers.forEach((value, key) => {
          headersObj[key] = value;
        });
      }

      const options: RequestInit = {
        method: input.method,
        headers: headersObj,
        redirect: input.redirect,
        signal: input.signal,
      };

      // Handle body - normalize to ensure Content-Length header is sent
      if (input.body !== null) {
        const normalizedBody = await normalizeBody(input.body as BodyInit);
        if (normalizedBody !== null) {
          options.body = normalizedBody;
          // Explicitly set Content-Length header
          const contentLength = getContentLength(normalizedBody);
          if (contentLength !== undefined) {
            options.headers = {
              ...headersObj,
              "Content-Length": contentLength.toString(),
            };
            // Remove Transfer-Encoding if present
            if (options.headers["Transfer-Encoding"]) {
              delete options.headers["Transfer-Encoding"];
            }
          }
        }
      }

      // Merge with init to allow overrides
      if (init) {
        // Copy init headers if present
        const initHeaders: Record<string, string> = {};
        if (init.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((value, key) => {
              initHeaders[key] = value;
            });
          } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([key, value]) => {
              initHeaders[key] = value;
            });
          } else {
            Object.assign(initHeaders, init.headers);
          }
        }

        // Normalize init body if present
        if (init.body !== null && init.body !== undefined) {
          const normalizedInitBody = await normalizeBody(init.body);
          if (normalizedInitBody !== null) {
            options.body = normalizedInitBody;
            // Explicitly set Content-Length header
            const contentLength = getContentLength(normalizedInitBody);
            if (contentLength !== undefined) {
              const mergedHeaders: Record<string, string> = {
                ...(options.headers as Record<string, string>),
                ...initHeaders,
                "Content-Length": contentLength.toString(),
              };
              // Remove Transfer-Encoding if present
              if (mergedHeaders["Transfer-Encoding"]) {
                delete mergedHeaders["Transfer-Encoding"];
              }
              options.headers = mergedHeaders;
            } else {
              options.headers = {
                ...(options.headers as Record<string, string>),
                ...initHeaders,
              };
            }
          } else {
            options.headers = {
              ...(options.headers as Record<string, string>),
              ...initHeaders,
            };
          }
        } else {
          options.headers = {
            ...(options.headers as Record<string, string>),
            ...initHeaders,
          };
        }
        // Merge other init properties
        Object.assign(options, {
          ...init,
          body: options.body,
          headers: options.headers,
        });
      }

      return undiciFetch(url, options);
    }

    // Otherwise, pass through to undici.fetch
    // Normalize body if present to ensure Content-Length header
    if (init && init.body !== null && init.body !== undefined) {
      const normalizedBody = await normalizeBody(init.body);
      const undiciInit: RequestInit = { ...init };

      // Copy headers to plain object
      const headersObj: Record<string, string> = {};
      if (init.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            headersObj[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([key, value]) => {
            headersObj[key] = value;
          });
        } else {
          Object.assign(headersObj, init.headers);
        }
      }

      if (normalizedBody !== null) {
        undiciInit.body = normalizedBody;
        // Explicitly set Content-Length header
        const contentLength = getContentLength(normalizedBody);
        if (contentLength !== undefined) {
          const finalHeaders: Record<string, string> = {
            ...headersObj,
            "Content-Length": contentLength.toString(),
          };
          // Remove Transfer-Encoding if present
          if (finalHeaders["Transfer-Encoding"]) {
            delete finalHeaders["Transfer-Encoding"];
          }
          undiciInit.headers = finalHeaders;
        } else {
          undiciInit.headers = headersObj;
        }
      } else {
        undiciInit.headers = headersObj;
      }
      return undiciFetch(input, undiciInit);
    }

    // Handle headers even when there's no body
    if (init && init.headers) {
      const headersObj: Record<string, string> = {};
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headersObj[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => {
          headersObj[key] = value;
        });
      } else {
        Object.assign(headersObj, init.headers);
      }
      return undiciFetch(input, { ...init, headers: headersObj });
    }

    return undiciFetch(input, init);
  };
};

// Patch global fetch to use undici.fetch wrapper in server environments
// This ensures arangojs uses undici.fetch which properly handles Content-Length headers
// We only do this in server environments to avoid affecting browser code
// Note: This patch is necessary because Next.js route handlers may use a fetch
// implementation that uses Transfer-Encoding: chunked, which ArangoDB doesn't support
if (isServer) {
  // Replace global fetch with undici.fetch wrapper to ensure Content-Length headers are sent
  // This is safe because:
  // 1. We're only doing it in server environments (not browser)
  // 2. undici.fetch is the standard Node.js fetch implementation
  // 3. The wrapper handles Request objects properly for arangojs compatibility
  // 4. This ensures arangojs uses the correct fetch that ArangoDB requires
  // @ts-ignore - Type incompatibility between undici types and global fetch types
  globalThis.fetch = createUndiciFetchWrapper();
}

// Create database connection
// agentOptions forces arangojs to use undici, and we've also patched global fetch
const dbConfig: any = {
  url: dbUrl,
  auth: { username: dbUser, password: dbPassword },
  databaseName: dbName,
};

// In server environments, provide agentOptions to force undici usage
if (isServer) {
  dbConfig.agentOptions = {};
}

export const db = new Database(dbConfig);

// Collections
export const collections = {
  users: db.collection("users"),
  facts: db.collection("facts"),
  relations: db.collection("relations"),
  knowledge_cards: db.collection("knowledge_cards"),
  webhooks: db.collection("webhooks"),
  files: db.collection("files"),
  invitations: db.collection("invitations"),
  oauth_authorization_requests: db.collection("oauth_authorization_requests"),
  oauth_authorization_codes: db.collection("oauth_authorization_codes"),
  worker_logs: db.collection("worker_logs"),
  worker_triggers: db.collection("worker_triggers"),
  chat_threads: db.collection("chat_threads"),
  chat_messages: db.collection("chat_messages"),
  workspaces: db.collection("workspaces"),
  workspace_members: db.collection("workspace_members"),
  data_sources: db.collection("data_sources"),
};

// Graph for relations
export const knowledgeGraph = db.graph("knowledge_graph");

// Lazy initialization flag
let initialized = false;
let initPromise: Promise<void> | null = null;

export async function init() {
  // Ensure database exists
  const sysDbConfig: any = {
    url: dbUrl,
    auth: { username: dbUser, password: dbPassword },
  };

  // Use same configuration as main db to ensure undici.fetch is used
  if (isServer) {
    sysDbConfig.agentOptions = {};
  }

  const sysDb = new Database(sysDbConfig);

  try {
    await sysDb.createDatabase(dbName);
    console.log(`Database ${dbName} created`);
  } catch (error: any) {
    if (error.errorNum !== 1207) {
      // 1207 = database already exists
      throw error;
    }
  }

  // Create document collections
  const documentCollectionNames = [
    "users",
    "facts",
    "knowledge_cards",
    "webhooks",
    "files",
    "invitations",
    "oauth_authorization_requests",
    "oauth_authorization_codes",
    "worker_logs",
    "worker_triggers",
    "chat_threads",
    "chat_messages",
    "workspaces",
    "workspace_members",
    "data_sources",
  ];

  for (const name of documentCollectionNames) {
    try {
      const collection = db.collection(name);
      await collection.create();
      console.log(`Collection ${name} created`);
    } catch (error: any) {
      if (error.errorNum !== 1207) {
        // 1207 = collection already exists
        throw error;
      }
    }
  }

  // Create edge collection for relations (required for graphs)
  try {
    const relationsCollection = db.collection("relations");
    // Check if collection exists and its type
    let needsRecreate = false;
    try {
      const info = await relationsCollection.get();
      // Check if it's an edge collection (type: 3)
      if (info.type !== 3) {
        console.log(
          "Relations collection exists as document collection, dropping to recreate as edge collection...",
        );
        await relationsCollection.drop();
        needsRecreate = true;
      } else {
        console.log("Edge collection relations already exists");
      }
    } catch (e: any) {
      // Collection doesn't exist, create it
      needsRecreate = true;
    }

    if (needsRecreate) {
      // Create as edge collection (type: 3)
      await relationsCollection.create({ type: 3 });
      console.log(`Edge collection relations created`);
    } else {
      // Check if collection has a schema that might be causing issues
      try {
        const properties = await relationsCollection.properties();
        console.log("Relations collection properties:", JSON.stringify(properties, null, 2));
        
        if (properties.schema) {
          console.warn("Relations collection has a schema validation:", JSON.stringify(properties.schema, null, 2));
        }
        
        // Always try to remove schema validation and set level to none (it might be causing type mismatches)
        try {
          await relationsCollection.properties({ schema: null, level: "none" } as any);
          console.log("Removed schema validation and set validation level to none for relations collection");
        } catch (schemaError: any) {
          console.warn("Could not remove schema validation:", schemaError.message, schemaError);
        }
      } catch (e: any) {
        // Log the error but don't fail initialization
        console.error("Error checking/updating relations collection properties:", e.message, e);
      }
    }
  } catch (error: any) {
    if (error.errorNum !== 1207) {
      // 1207 = collection already exists
      throw error;
    }
  }

  // Create indexes
  try {
    await collections.facts.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_fact_workspace_id",
    });
    await collections.facts.ensureIndex({
      type: "persistent",
      fields: ["created_by"],
      name: "idx_fact_created_by",
    });
    await collections.facts.ensureIndex({
      type: "persistent",
      fields: ["trashed"],
      name: "idx_fact_trashed",
    });
    // Ensure fulltext index exists (drop old inverted index if it exists)
    try {
      // Try to get existing index
      const indexes = await collections.facts.indexes();
      const existingIndex = indexes.find(
        (idx: any) => idx.name === "idx_fact_content_fulltext",
      );

      if (existingIndex) {
        // If index exists but is wrong type, drop it
        if (existingIndex.type !== "fulltext") {
          console.log(
            "Dropping old index idx_fact_content_fulltext (wrong type)",
          );
          await collections.facts.dropIndex("idx_fact_content_fulltext");
        }
      }
    } catch (error: any) {
      // Index doesn't exist or error checking, continue to create
      console.log("Checking existing index:", error.message);
    }

    // Create fulltext index
    try {
      await collections.facts.ensureIndex({
        type: "fulltext",
        fields: ["content"],
        name: "idx_fact_content_fulltext",
        minLength: 3,
      } as any);
      console.log("Fulltext index for facts created");
    } catch (error: any) {
      if (error.errorNum !== 1710) {
        // 1710 = index already exists
        console.warn(
          "Fulltext index creation warning for facts:",
          error.message,
        );
      }
    }
    // Vector index for facts embeddings (dimension 1536 for text-embedding-3-small)
    // All facts now have embeddings (placeholder zero vectors if not yet generated)
    // This enables APPROX_NEAR_COSINE for O(log n) vector search
    try {
      // Count documents with embeddings (including placeholder zeros)
      const factCountQuery = `
        LET count = LENGTH(
          FOR fact IN facts
            FILTER fact.embedding != null
            RETURN 1
        )
        RETURN count
      `;
      const factCountCursor = await collections.facts.database.query(factCountQuery);
      const factVectorCount = (await factCountCursor.next()) || 0;

      // nLists must be <= vector count (FAISS requirement: training points >= clusters)
      // Skip vector index entirely if fewer than 16 vectors — JS cosine fallback handles small collections
      if (factVectorCount < 16) {
        console.log(`Skipping vector index for facts (only ${factVectorCount} vectors, need at least 16 for index)`);
      } else {
        const nLists = Math.min(factVectorCount, 100);

        await collections.facts.ensureIndex({
          type: "vector",
          fields: ["embedding"],
          name: "idx_fact_embedding_vector",
          params: {
            metric: "cosine",
            dimension: 1536,
            nLists: nLists,
          },
        });
        console.log(`Vector index for facts created/verified with nLists=${nLists} (${factVectorCount} documents)`);
      }
    } catch (error: any) {
      if (error.errorNum !== 1710) {
        // 1710 = index already exists
        console.warn("Vector index creation warning for facts:", error.message);
      } else {
        console.log("Vector index for facts already exists");
      }
    }
    await collections.users.ensureIndex({
      type: "persistent",
      fields: ["username"],
      unique: true,
      name: "idx_user_username",
    });
    await collections.users.ensureIndex({
      type: "persistent",
      fields: ["api_key"],
      name: "idx_user_api_key",
    });
    await collections.invitations.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_invitation_workspace_id",
    });
    await collections.invitations.ensureIndex({
      type: "persistent",
      fields: ["token"],
      unique: true,
      name: "idx_invitation_token",
    });
    await collections.invitations.ensureIndex({
      type: "persistent",
      fields: ["status"],
      name: "idx_invitation_status",
    });
    await collections.invitations.ensureIndex({
      type: "persistent",
      fields: ["invited_by"],
      name: "idx_invitation_invited_by",
    });
    await collections.workspaces.ensureIndex({
      type: "persistent",
      fields: ["slug"],
      unique: true,
      name: "idx_workspace_slug",
    });
    await collections.workspaces.ensureIndex({
      type: "persistent",
      fields: ["created_by"],
      name: "idx_workspace_created_by",
    });
    await collections.workspaces.ensureIndex({
      type: "persistent",
      fields: ["rest_api_key"],
      unique: true,
      sparse: true,
      name: "idx_workspace_rest_api_key",
    });
    await collections.workspace_members.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_workspace_member_workspace_id",
    });
    await collections.workspace_members.ensureIndex({
      type: "persistent",
      fields: ["user_id"],
      name: "idx_workspace_member_user_id",
    });
    await collections.workspace_members.ensureIndex({
      type: "persistent",
      fields: ["workspace_id", "user_id"],
      unique: true,
      name: "idx_workspace_member_workspace_user",
    });
    await collections.relations.ensureIndex({
      type: "persistent",
      fields: ["from_fact"],
      name: "idx_relation_from",
    });
    await collections.relations.ensureIndex({
      type: "persistent",
      fields: ["to_fact"],
      name: "idx_relation_to",
    });
    await collections.relations.ensureIndex({
      type: "persistent",
      fields: ["type"],
      name: "idx_relation_type",
    });
    // Vector index for relations embeddings
    try {
      // Count vectors to ensure collection isn't empty (nLists must be <= vector count)
      const relationCountQuery = `
        LET count = LENGTH(
          FOR relation IN relations
            FILTER relation.embedding != null
            RETURN relation
        )
        RETURN count
      `;
      const relationCountCursor = await collections.relations.database.query(relationCountQuery);
      const relationVectorCount = (await relationCountCursor.next()) || 0;

      if (relationVectorCount < 16) {
        console.log(`Skipping vector index for relations (${relationVectorCount} vectors, need at least 16)`);
      } else {
        const nLists = Math.min(relationVectorCount, 100);
        await collections.relations.ensureIndex({
          type: "vector",
          fields: ["embedding"],
          name: "idx_relation_embedding_vector",
          params: {
            metric: "cosine",
            dimension: 1536,
            nLists: nLists,
          },
        });
        console.log(`Vector index for relations created with nLists=${nLists} (${relationVectorCount} vectors)`);
      }
    } catch (error: any) {
      if (error.errorNum !== 1710) {
        console.warn(
          "Vector index creation warning for relations:",
          error.message,
        );
      }
    }
    await collections.worker_logs.ensureIndex({
      type: "persistent",
      fields: ["worker_name"],
      name: "idx_worker_log_worker_name",
    });
    await collections.worker_logs.ensureIndex({
      type: "persistent",
      fields: ["status"],
      name: "idx_worker_log_status",
    });
    await collections.worker_logs.ensureIndex({
      type: "persistent",
      fields: ["created_at"],
      name: "idx_worker_log_created_at",
    });
    await collections.chat_threads.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_chat_thread_workspace_id",
    });
    await collections.chat_threads.ensureIndex({
      type: "persistent",
      fields: ["user_id"],
      name: "idx_chat_thread_user_id",
    });
    await collections.chat_threads.ensureIndex({
      type: "persistent",
      fields: ["updated_at"],
      name: "idx_chat_thread_updated_at",
    });
    await collections.knowledge_cards.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_knowledge_card_workspace_id",
    });
    await collections.files.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_file_workspace_id",
    });
    await collections.relations.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_relation_workspace_id",
    });
    await collections.webhooks.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_webhook_workspace_id",
    });
    await collections.chat_messages.ensureIndex({
      type: "persistent",
      fields: ["thread_id"],
      name: "idx_chat_message_thread_id",
    });
    await collections.chat_messages.ensureIndex({
      type: "persistent",
      fields: ["thread_id", "sequence"],
      name: "idx_chat_message_thread_sequence",
    });
    await collections.chat_messages.ensureIndex({
      type: "persistent",
      fields: ["tool_call_id"],
      name: "idx_chat_message_tool_call_id",
    });
    await collections.data_sources.ensureIndex({
      type: "persistent",
      fields: ["workspace_id"],
      name: "idx_data_source_workspace_id",
    });
    await collections.data_sources.ensureIndex({
      type: "persistent",
      fields: ["enabled", "next_run_at"],
      name: "idx_data_source_enabled_next_run",
    });
    // Vector index for knowledge_cards embeddings
    try {
      // Count vectors with embeddings to determine appropriate nLists
      // nLists must be <= number of vectors (clusters can't exceed training points)
      const countQuery = `
        LET count = LENGTH(
          FOR card IN knowledge_cards
            FILTER card.embedding != null
            RETURN card
        )
        RETURN count
      `;
      const countCursor =
        await collections.knowledge_cards.database.query(countQuery);
      const vectorCount = (await countCursor.next()) || 0;

      if (vectorCount < 16) {
        console.log(`Skipping vector index for knowledge_cards (${vectorCount} vectors, need at least 16)`);
      } else {
        const nLists = Math.min(vectorCount, 100);

        await collections.knowledge_cards.ensureIndex({
          type: "vector",
          fields: ["embedding"],
          name: "idx_knowledge_card_embedding_vector",
          params: {
            metric: "cosine",
            dimension: 1536,
            nLists: nLists,
          },
        });
        console.log(
          `Vector index for knowledge_cards created with nLists=${nLists} (${vectorCount} vectors with embeddings)`,
        );
      }
    } catch (error: any) {
      if (error.errorNum !== 1710) {
        console.warn(
          "Vector index creation warning for knowledge_cards:",
          error.message,
        );
      }
    }
  } catch (error: any) {
    console.warn("Index creation warning:", error.message);
  }

  // Create ArangoSearch view for BM25 full-text scoring
  // This replaces the deprecated FULLTEXT index with proper BM25 ranking
  try {
    const viewName = "facts_search_view";
    const existingViews = await db.views();
    const viewExists = existingViews.some((v: any) => v.name === viewName);

    if (!viewExists) {
      await db.createView(viewName, {
        type: "arangosearch",
        links: {
          facts: {
            includeAllFields: false,
            fields: {
              content: {
                analyzers: ["text_en"],  // English text analyzer for BM25
              },
              workspace_id: {},  // For filtering
              trashed: {},       // For filtering
              embedding_model: {},  // For filtering placeholder zeros
            },
          },
        },
      });
      console.log("ArangoSearch view 'facts_search_view' created for BM25 scoring");
    } else {
      console.log("ArangoSearch view 'facts_search_view' already exists");
    }
  } catch (error: any) {
    console.warn("ArangoSearch view creation warning:", error.message);
  }

  // Create knowledge graph
  try {
    await knowledgeGraph.create([
      {
        collection: "relations",
        from: ["facts"],
        to: ["facts"],
      },
    ]);
    console.log("Knowledge graph created");
  } catch (error: any) {
    if (error.errorNum !== 1925) {
      // 1925 = graph already exists
      throw error;
    }
  }

  initialized = true;
}

// Ensure database is initialized (lazy initialization)
export async function ensureInitialized() {
  if (initialized) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = init();
  await initPromise;
  initPromise = null;
}

/**
 * Ensure vector index exists for a collection.
 * Creates the index if embeddings exist but no vector index is present.
 * Safe to call multiple times (idempotent).
 *
 * @param collectionName - Name of collection (facts, relations, knowledge_cards)
 * @returns true if index exists or was created, false if no embeddings yet
 */
export async function ensureVectorIndex(
  collectionName: 'facts' | 'relations' | 'knowledge_cards'
): Promise<boolean> {
  await ensureInitialized();

  const collection = collections[collectionName];
  if (!collection) {
    console.warn(`Collection ${collectionName} not found`);
    return false;
  }

  try {
    // Check if index already exists
    const indexes = await collection.indexes();
    const vectorIndexExists = indexes.some(
      (idx: any) => idx.type === 'vector' && idx.name?.includes('embedding')
    );

    if (vectorIndexExists) {
      console.log(`Vector index already exists for ${collectionName}`);
      return true;
    }

    // Count vectors to ensure collection has embeddings
    const countQuery = `
      LET count = LENGTH(
        FOR doc IN ${collectionName}
          FILTER doc.embedding != null
          RETURN doc
      )
      RETURN count
    `;
    const countCursor = await collection.database.query(countQuery);
    const vectorCount = (await countCursor.next()) || 0;

    if (vectorCount < 16) {
      console.log(`Not enough embeddings in ${collectionName} (${vectorCount}, need at least 16), skipping vector index`);
      return false;
    }

    // Create vector index
    // In arangojs 10.x, params MUST be nested, and fields is a tuple [string]
    const nLists = Math.min(vectorCount, 100);
    await collection.ensureIndex({
      type: "vector",
      fields: ["embedding"],  // Tuple with single field
      name: `idx_${collectionName}_embedding_vector`,
      params: {  // params is required and must be nested
        metric: "cosine",
        dimension: 1536,
        nLists: nLists,
      },
    });

    console.log(`✓ Created vector index for ${collectionName} (nLists=${nLists}, ${vectorCount} vectors)`);
    return true;
  } catch (error: any) {
    if (error.errorNum === 1710) {
      // Index already exists (race condition)
      console.log(`Vector index already exists for ${collectionName} (concurrent creation)`);
      return true;
    }
    console.error(`Failed to create vector index for ${collectionName}:`, {
      message: error.message,
      errorNum: error.errorNum,
      code: error.code,
      response: error.response?.body,
      stack: error.stack,
    });
    return false;
  }
}
