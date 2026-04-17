/**
 * Ensures Arango has schema + a benchmark user/workspace and that
 * .env.benchmark credentials match this database (fixes fresh kp-bench DB).
 *
 * Run via: dotenv -e .env -e .env.benchmark -- npx tsx scripts/bench-warm-db.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { init, User, Workspace, WorkspaceMember } from "@knowledgeplane/db";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function writeEnvBenchmark(content: Record<string, string>) {
  const body = [
    "# KnowledgePlane benchmark environment",
    "# Updated by scripts/bench-warm-db.ts for npm run bench:quick / bench:all",
    "# DO NOT COMMIT REAL CREDENTIALS",
    "",
    `export KP_API_URL="${content.KP_API_URL}"`,
    `export ARANGO_URL="${content.ARANGO_URL}"`,
    "",
    `export KP_WORKSPACE_ID="${content.KP_WORKSPACE_ID}"`,
    `export KP_USER_ID="${content.KP_USER_ID}"`,
    `export KP_API_KEY="${content.KP_API_KEY}"`,
    "",
    `export OPENAI_API_KEY="${content.OPENAI_API_KEY}"`,
    "",
  ].join("\n");
  writeFileSync(resolve(root, ".env.benchmark"), body, "utf8");
}

async function credentialsMatchDb(): Promise<boolean> {
  const apiKey = process.env.KP_API_KEY?.trim();
  const wsId = process.env.KP_WORKSPACE_ID?.trim();
  const userId = process.env.KP_USER_ID?.trim();
  if (!apiKey || !wsId || !userId) {
    return false;
  }
  try {
    const byKey = await Workspace.findByRestApiKey(apiKey);
    const byId = await Workspace.findById(wsId);
    const user = await User.findById(userId);
    if (!byKey || !byId || !user || byKey.id !== wsId) {
      return false;
    }
    const member = await WorkspaceMember.findByWorkspaceAndUser(wsId, userId);
    return !!member;
  } catch {
    return false;
  }
}

async function main() {
  const arangoUrl = process.env.ARANGO_URL || "http://localhost:8529";
  const kpApiUrl = process.env.KP_API_URL || "http://localhost:8081";
  const openai = process.env.OPENAI_API_KEY || "";

  await init();

  if (await credentialsMatchDb()) {
    console.log("Benchmark credentials already match this database.");
    return;
  }

  let user = await User.findByUsername("benchmark");
  if (!user) {
    user = await User.create({
      username: "benchmark",
      email: "benchmark@bench.local",
    });
    console.log(`Created user ${user.id}`);
  }

  let workspace = await Workspace.findBySlug("kp-benchmark");
  if (!workspace) {
    workspace = await Workspace.create({
      name: "KP Benchmark",
      description: "Auto-created for npm run bench:*",
      created_by: user.id,
    });
    await WorkspaceMember.create({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "owner",
    });
    console.log(`Created workspace ${workspace.id}`);
  } else {
    const member = await WorkspaceMember.findByWorkspaceAndUser(
      workspace.id,
      user.id,
    );
    if (!member) {
      await WorkspaceMember.create({
        workspace_id: workspace.id,
        user_id: user.id,
        role: "owner",
      });
      console.log(`Linked user to workspace ${workspace.id}`);
    }
  }

  const apiKey = await Workspace.generateRestApiKey(workspace.id, user.id);
  console.log("Issued workspace REST API key for benchmarks");

  writeEnvBenchmark({
    KP_API_URL: kpApiUrl,
    ARANGO_URL: arangoUrl,
    KP_WORKSPACE_ID: workspace.id,
    KP_USER_ID: user.id,
    KP_API_KEY: apiKey,
    OPENAI_API_KEY: openai,
  });

  console.log("Wrote .env.benchmark with credentials for this database.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
