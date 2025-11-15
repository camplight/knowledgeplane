import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import secureSession from "@fastify/secure-session";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { init as initDb } from "@knowledgeplane/db";
import health from "./routes/health.js";
import mcp from "./routes/mcp.js";
import oauthRoutes from "./routes/oauth.js";

async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      ...(!isProduction && {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
            colorize: true,
            singleLine: false,
            hideObject: false,
          },
        },
      }),
    },
  });

  app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register cookie plugin (required for sessions)
  app.register(cookie);

  // Register secure session plugin (required for OAuth state management)
  // Generate a secret key for session encryption (32 bytes = 64 hex characters)
  const sessionSecret =
    process.env.SESSION_SECRET ||
    "change-me-in-production-to-a-random-secret-key-at-least-32-chars";
  if (sessionSecret.length < 32) {
    app.log.warn(
      "SESSION_SECRET is too short. Please use at least 32 characters for production.",
    );
  }

  app.register(secureSession, {
    secret: Buffer.from(sessionSecret.padEnd(64, "0").slice(0, 64), "utf8"),
    cookie: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  });

  app.register(swagger, {
    openapi: {
      info: {
        title: "knowledgeplane-mcp-server",
        version: "0.1.0",
      },
    },
  });
  app.register(swaggerUI, {
    routePrefix: "/docs",
  });

  await initDb();

  app.register(health);
  app.register(oauthRoutes);
  app.register(mcp);

  const port = Number(process.env.PORT || 8080);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info({ port }, "Server started");

  // Graceful shutdown handlers for hot reload
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down gracefully...");
    try {
      await app.close();
      // ArangoDB connection cleanup is handled automatically
      app.log.info("Server closed");
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (err) => {
    app.log.error({ err }, "Uncaught exception");
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    app.log.error({ reason, promise }, "Unhandled rejection");
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
