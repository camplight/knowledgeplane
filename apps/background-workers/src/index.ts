import "./load-env.js";
import { init } from "@knowledgeplane/db";
import { CardConsolidator } from "./workers/card-consolidator.js";
import { EmbeddingsGenerator } from "./workers/embeddings-generator.js";
import { DataSourceRunner } from "./workers/data-source-runner.js";

async function main() {
  console.log("Starting KnowledgePlane Background Workers...");

  // Initialize database
  await init();
  console.log("Database initialized");

  // Start card consolidator worker
  const cardConsolidator = new CardConsolidator();
  cardConsolidator.start();

  // Start embeddings generator worker
  const embeddingsGenerator = new EmbeddingsGenerator();
  embeddingsGenerator.start();

  // Start data source runner worker
  const dataSourceRunner = new DataSourceRunner();
  dataSourceRunner.start();

  console.log("All workers started");

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully...");
    cardConsolidator.stop();
    embeddingsGenerator.stop();
    dataSourceRunner.stop();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down gracefully...");
    cardConsolidator.stop();
    embeddingsGenerator.stop();
    dataSourceRunner.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

