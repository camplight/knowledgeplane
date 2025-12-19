#!/usr/bin/env node
/**
 * Reset database to empty state by dropping all collections and graphs
 */
import "dotenv/config";

const dbUrl = process.env.ARANGO_URL || "http://localhost:8529";
const dbName = process.env.ARANGO_DB_NAME || "knowledgeplane";
const dbUser = process.env.ARANGO_USER || "root";
const dbPassword = process.env.ARANGO_PASSWORD || "root";

// Create basic auth header
const auth = Buffer.from(`${dbUser}:${dbPassword}`).toString("base64");
const headers = {
  Authorization: `Basic ${auth}`,
  "Content-Type": "application/json",
};

// Helper function to make API requests
async function apiRequest(method, path, body = null) {
  const url = `${dbUrl}/_db/${dbName}${path}`;
  const options = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ errorMessage: response.statusText }));
    return { error: error.errorNum || error.errorMessage, status: response.status };
  }
  
  return await response.json().catch(() => ({}));
}

// All collections that need to be dropped
const collectionNames = [
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
  "relations", // Edge collection
];

const graphName = "knowledge_graph";

async function resetDatabase() {
  try {
    console.log(`Resetting database: ${dbName} at ${dbUrl}\n`);

    // Drop the graph first (it depends on collections)
    const graphResult = await apiRequest("DELETE", `/_api/gharial/${graphName}`);
    if (graphResult.error) {
      if (graphResult.error === 1924) {
        // 1924 = graph not found
        console.log(`  Graph ${graphName} does not exist, skipping...`);
      } else {
        throw new Error(`Failed to drop graph: ${JSON.stringify(graphResult)}`);
      }
    } else {
      console.log(`✓ Dropped graph: ${graphName}`);
    }

    // Drop all collections
    for (const name of collectionNames) {
      const result = await apiRequest("DELETE", `/_api/collection/${name}`);
      if (result.error) {
        if (result.error === 1203) {
          // 1203 = collection not found
          console.log(`  Collection ${name} does not exist, skipping...`);
        } else {
          throw new Error(`Failed to drop collection ${name}: ${JSON.stringify(result)}`);
        }
      } else {
        console.log(`✓ Dropped collection: ${name}`);
      }
    }

    console.log("\n✓ Database reset complete! All collections and graphs have been removed.");
    console.log("  Run your app to reinitialize the database structure.");
  } catch (error) {
    console.error("Error resetting database:", error);
    process.exit(1);
  }
}

resetDatabase();
