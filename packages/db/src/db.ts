import { Database } from "arangojs";
import "dotenv/config";
import { fetch as undiciFetch } from "undici";

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
async function normalizeBody(body: BodyInit | null): Promise<Buffer | string | null> {
  if (body === null || body === undefined) {
    return null;
  }
  
  // If it's already a string or Buffer, return as-is
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof Buffer) {
    return body;
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
    
    return Buffer.from(result);
  }
  
  // If it's an ArrayBuffer or ArrayBufferView, convert to Buffer
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  
  // For other types (FormData, Blob, etc.), pass through and let undici handle it
  // These should be rare for arangojs use cases
  return body as any;
}

// Create a wrapper around undici.fetch that handles Request objects properly
// undici.fetch may not handle Request objects the same way as standard fetch,
// so we extract the URL and options from Request objects before passing them to undici.fetch
// We also normalize the body to ensure Content-Length headers are sent instead of chunked encoding
const createUndiciFetchWrapper = (): typeof fetch => {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // If input is a Request object, extract URL and options
    if (input instanceof Request) {
      const url = input.url;
      
      // Build options from Request object
      const options: RequestInit = {
        method: input.method,
        headers: input.headers,
        redirect: input.redirect,
        signal: input.signal,
      };
      
      // Handle body - normalize to ensure Content-Length header is sent
      if (input.body !== null) {
        const normalizedBody = await normalizeBody(input.body);
        if (normalizedBody !== null) {
          options.body = normalizedBody;
        }
      }
      
      // Merge with init to allow overrides
      if (init) {
        // Normalize init body if present
        if (init.body !== null && init.body !== undefined) {
          const normalizedInitBody = await normalizeBody(init.body);
          if (normalizedInitBody !== null) {
            options.body = normalizedInitBody;
          }
        }
        // Merge other init properties
        Object.assign(options, { ...init, body: options.body });
      }
      
      return undiciFetch(url, options);
    }
    
    // Otherwise, pass through to undici.fetch
    // Normalize body if present to ensure Content-Length header
    if (init && init.body !== null && init.body !== undefined) {
      const normalizedBody = await normalizeBody(init.body);
      const undiciInit = { ...init };
      if (normalizedBody !== null) {
        undiciInit.body = normalizedBody;
      }
      return undiciFetch(input, undiciInit);
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
  cards: db.collection("cards"),
  webhooks: db.collection("webhooks"),
  categories: db.collection("categories"),
  files: db.collection("files"),
  invitations: db.collection("invitations"),
  oauth_authorization_requests: db.collection("oauth_authorization_requests"),
  oauth_authorization_codes: db.collection("oauth_authorization_codes"),
};

// Graph for relations
export const knowledgeGraph = db.graph("knowledge_graph");

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
    "cards",
    "webhooks",
    "categories",
    "files",
    "invitations",
    "oauth_authorization_requests",
    "oauth_authorization_codes",
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
      fields: ["knowledge_context"],
      name: "idx_fact_knowledge_context",
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
    await collections.facts.ensureIndex({
      type: "inverted",
      fields: ["content"],
      name: "idx_fact_content_fulltext",
    } as any);
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
      fields: ["email"],
      name: "idx_invitation_email",
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
  } catch (error: any) {
    console.warn("Index creation warning:", error.message);
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
}
