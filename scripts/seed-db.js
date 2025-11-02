#!/usr/bin/env node
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/knowledgeplane",
});

async function seedDb() {
  try {
    console.log("Connecting to database...");
    await pool.query("SELECT 1");
    console.log("✓ Database connected");

    // Run migrations if needed (they should already be run by docker-entrypoint-initdb.d)
    // But we can verify they exist
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'fact'
      );
    `);

    if (!result.rows[0].exists) {
      console.log("⚠ Tables not found. Migrations should run automatically when DB starts.");
      console.log("   Run migrations manually or restart the database container.");
    } else {
      console.log("✓ Database schema verified");
    }

    // Optionally seed test data here
    // Example: Create a test user or fact
    const testData = process.env.SEED_TEST_DATA === "true";
    
    if (testData) {
      console.log("Seeding test data...");
      // Add test data seeding logic here if needed
      console.log("✓ Test data seeded (placeholder - add logic as needed)");
    } else {
      console.log("ℹ Skipping test data (set SEED_TEST_DATA=true to seed)");
    }

    await pool.end();
    console.log("✓ Database seed complete");
  } catch (err) {
    console.error("✗ Database seed failed:", err.message);
    await pool.end();
    process.exit(1);
  }
}

seedDb();

