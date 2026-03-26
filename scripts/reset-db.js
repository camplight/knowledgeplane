#!/usr/bin/env node
/**
 * Reset database to empty state by dropping all collections and graphs
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dbUrl = process.env.ARANGO_URL || "http://localhost:8529";
const dbName = process.env.ARANGO_DB_NAME || "knowledgeplane";
const dbUser = process.env.ARANGO_USER || "root";
const dbPassword = process.env.ARANGO_PASSWORD || "root";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = resolve(repoRoot, "infra/docker-compose.dev.yml");

// Create basic auth header
const auth = Buffer.from(`${dbUser}:${dbPassword}`).toString("base64");
const headers = {
  Authorization: `Basic ${auth}`,
  "Content-Type": "application/json",
};

function printConnectionHelp(message) {
  console.error(`\n✗ ${message}`);
  console.error(`  Could not connect to ArangoDB at ${dbUrl}`);
  console.error("  Troubleshooting:");
  console.error("  1) Start ArangoDB: npm run dev:infra");
  console.error("  2) Verify connectivity: curl http://localhost:8529/_api/version");
  console.error("  3) If DB runs elsewhere, set ARANGO_URL/ARANGO_USER/ARANGO_PASSWORD");
  console.error("     Example: ARANGO_URL=http://127.0.0.1:8529 npm run db:reset\n");
}

function isLocalArangoUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function runDockerCompose(args) {
  return execFileSync("docker", ["compose", "-f", composeFile, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isLocalDbServiceRunning() {
  try {
    const containerId = runDockerCompose(["ps", "--status", "running", "-q", "db"]).trim();
    return containerId.length > 0;
  } catch {
    return false;
  }
}

function startLocalDb() {
  console.log("ArangoDB is not reachable; starting local database container...");
  try {
    runDockerCompose(["up", "-d", "db"]);
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    throw new Error(
      `Failed to start local ArangoDB via docker compose.\n${stderr || error.message}`,
    );
  }
}

function stopLocalDb() {
  console.log("\nStopping local database container started by db:reset...");
  try {
    runDockerCompose(["down"]);
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    console.error(
      `⚠ Failed to stop local ArangoDB automatically. You can stop it manually with: npm run dev:stop\n${stderr || error.message}`,
    );
  }
}

async function checkDatabaseReachable() {
  try {
    const response = await fetch(`${dbUrl}/_api/version`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: `Authentication failed (${response.status}). Check ARANGO_USER/ARANGO_PASSWORD.`,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: `ArangoDB health check failed with status ${response.status}.`,
      };
    }
    return { ok: true };
  } catch (error) {
    const causeCode = error?.cause?.code;
    if (causeCode === "ECONNREFUSED") {
      return {
        ok: false,
        reason: "Connection refused. ArangoDB is not running or not reachable.",
        code: causeCode,
      };
    }
    return { ok: false, reason: `Health check failed: ${error.message}`, code: causeCode };
  }
}

async function waitForDatabaseReady(maxRetries = 30, retryDelayMs = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await checkDatabaseReachable();
    if (status.ok) {
      return;
    }
    if (i < maxRetries - 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, retryDelayMs));
    }
  }
  throw new Error(
    `ArangoDB did not become ready after ${(maxRetries * retryDelayMs) / 1000} seconds.`,
  );
}

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
  let startedLocalDb = false;
  try {
    console.log(`Resetting database: ${dbName} at ${dbUrl}\n`);
    const localArangoUrl = isLocalArangoUrl(dbUrl);
    const localDbWasAlreadyRunning = localArangoUrl ? isLocalDbServiceRunning() : false;

    const reachability = await checkDatabaseReachable();
    if (!reachability.ok) {
      if (localArangoUrl) {
        if (localDbWasAlreadyRunning) {
          console.log(
            "Local database container is already running; waiting for it to become ready...",
          );
        } else {
          startLocalDb();
          startedLocalDb = true;
        }
        await waitForDatabaseReady();
      } else {
        printConnectionHelp(reachability.reason);
        process.exit(1);
      }
    }

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
  } finally {
    if (startedLocalDb) {
      stopLocalDb();
    }
  }
}

resetDatabase();
