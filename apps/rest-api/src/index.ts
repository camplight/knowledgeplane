import "dotenv/config";
import { createServer } from "./server.js";

const port = parseInt(process.env.PORT || "8081", 10);
const host = process.env.HOST || "0.0.0.0";

try {
  const server = await createServer();
  const address = await server.listen({ port, host });
  console.log(`REST API server listening on ${address}`);
} catch (err) {
  console.error("Failed to start server:", err);
  process.exit(1);
}

