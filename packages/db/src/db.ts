import { Database } from "arangojs";
import "dotenv/config";

const dbUrl = process.env.ARANGO_URL || "http://localhost:8529";
const dbName = process.env.ARANGO_DB_NAME || "knowledgeplane";
const dbUser = process.env.ARANGO_USER || "root";
const dbPassword = process.env.ARANGO_PASSWORD || "root";

// Ensure we use Node.js fetch, not browser fetch
// By providing agentOptions (even empty), arangojs will use undici.fetch which is Node.js native
// This prevents Next.js from using browser fetch polyfills that use Transfer-Encoding: chunked
// ArangoDB requires Content-Length header and doesn't support Transfer-Encoding: chunked
// Only use agentOptions in Node.js environment (not browser) to force undici usage
// undici is installed as a dependency to ensure it's available
// @ts-ignore-next-line: 'window' may be undefined in Node
const agentOptions = typeof window === "undefined" ? {} : undefined;

// Create database connection
export const db = new Database({
  url: dbUrl,
  auth: { username: dbUser, password: dbPassword },
  databaseName: dbName,
  ...(agentOptions && { agentOptions }), // This forces arangojs to use undici.fetch instead of globalThis.fetch
});

// Collections
export const collections = {
  users: db.collection("users"),
  facts: db.collection("facts"),
  relations: db.collection("relations"),
  cards: db.collection("cards"),
  webhooks: db.collection("webhooks"),
  categories: db.collection("categories"),
  files: db.collection("files"),
  oauth_authorization_requests: db.collection("oauth_authorization_requests"),
  oauth_authorization_codes: db.collection("oauth_authorization_codes"),
};

// Graph for relations
export const knowledgeGraph = db.graph("knowledge_graph");

export async function init() {
  // Ensure database exists
  const sysDb = new Database({
    url: dbUrl,
    auth: { username: dbUser, password: dbPassword },
    ...(agentOptions && { agentOptions }), // Use same agentOptions to ensure undici.fetch is used
  });

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
