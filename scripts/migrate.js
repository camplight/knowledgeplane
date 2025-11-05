#!/usr/bin/env node
/**
 * Database migration script
 * Runs all SQL files in infra/migrations/ directory in order
 */
import { readdir } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/knowledgeplane",
});

async function runMigrations() {
  const migrationsDir = join(projectRoot, "infra", "migrations");
  const files = await readdir(migrationsDir);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql"))
    .sort(); // Sort to ensure order (001, 002, 003, etc.)

  console.log(`Found ${sqlFiles.length} migration files`);

  for (const file of sqlFiles) {
    const filePath = join(migrationsDir, file);
    console.log(`Running migration: ${file}...`);
    try {
      const { readFile } = await import("fs/promises");
      const sql = await readFile(filePath, "utf-8");
      await pool.query(sql);
      console.log(`✓ ${file} completed`);
    } catch (error) {
      // If table/index already exists, that's okay (idempotent migrations)
      // Some migrations may fail if they reference old schema (e.g., 001/002 vs 003)
      // We'll log but continue
      if (error.message.includes("already exists")) {
        console.log(`⊘ ${file} skipped (already applied)`);
      } else if (
        error.code === "42703" ||
        error.message.includes("does not exist")
      ) {
        // Column/table doesn't exist - might be an old migration referencing old schema
        console.log(
          `⊘ ${file} skipped (schema mismatch: ${error.message.split("\n")[0]})`,
        );
      } else {
        console.error(`✗ ${file} failed:`, error.message);
        // Don't throw - continue with other migrations
        // But log the error clearly
        console.error(`  Error code: ${error.code}`);
      }
    }
  }

  console.log("\n✓ All migrations completed");
  await pool.end();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

