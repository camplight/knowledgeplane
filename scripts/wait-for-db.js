#!/usr/bin/env node
import pg from "pg";

const pool = new pg.Pool({
  connectionString: "postgres://postgres:postgres@localhost:5432/knowledgeplane",
});

async function waitForDb() {
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("✓ Database is ready");
      await pool.end();
      process.exit(0);
    } catch (err) {
      if (i === 0) {
        process.stdout.write("Waiting for database");
      } else {
        process.stdout.write(".");
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.error("\n✗ Database failed to start after 30 seconds");
  await pool.end();
  process.exit(1);
}

waitForDb();
