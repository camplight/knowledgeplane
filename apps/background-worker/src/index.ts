import "dotenv/config";
import { init } from "@knowledgeplane/db";
import { CardConsolidator } from "./workers/card-consolidator.js";
import { CategoryOrganizer } from "./workers/category-organizer.js";

async function main() {
  console.log("Starting KnowledgePlane Background Workers...");

  // Initialize database
  await init();
  console.log("Database initialized");

  // Start card consolidator worker
  const cardConsolidator = new CardConsolidator();
  cardConsolidator.start();

  // Start category organizer worker
  const categoryOrganizer = new CategoryOrganizer();
  categoryOrganizer.start();

  console.log("All workers started");

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully...");
    cardConsolidator.stop();
    categoryOrganizer.stop();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down gracefully...");
    cardConsolidator.stop();
    categoryOrganizer.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

