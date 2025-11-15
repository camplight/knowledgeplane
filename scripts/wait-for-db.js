#!/usr/bin/env node
/**
 * Wait for ArangoDB to be ready
 */
async function waitForDb() {
  const dbUrl = process.env.ARANGO_URL || "http://localhost:8529";
  const maxRetries = 30;
  const retryDelay = 2000; // 2 seconds

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${dbUrl}/_api/version`);
      if (response.ok) {
        console.log("✓ ArangoDB is ready");
        return;
      }
    } catch (error) {
      // Database not ready yet
    }

    if (i < maxRetries - 1) {
      console.log(
        `Waiting for ArangoDB... (${i + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  console.error("✗ ArangoDB failed to start");
  process.exit(1);
}

waitForDb();
