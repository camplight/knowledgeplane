import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import secureSession from "@fastify/secure-session";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { createHash, randomBytes } from "node:crypto";
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
  // Generate a secret key for session encryption (32 bytes required)
  const sessionSecret = process.env.SESSION_SECRET;
  let sessionKey: Buffer;

  if (sessionSecret) {
    // Try to decode as hex (64 hex chars = 32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(sessionSecret)) {
      sessionKey = Buffer.from(sessionSecret, "hex");
    }
    // Try to decode as base64 (44 base64 chars = 32 bytes when decoded)
    else if (sessionSecret.length >= 44) {
      try {
        sessionKey = Buffer.from(sessionSecret, "base64");
        if (sessionKey.length !== 32) {
          // If base64 decode doesn't give exactly 32 bytes, hash it
          sessionKey = createHash("sha256").update(sessionSecret).digest();
        }
      } catch {
        // If base64 decode fails, hash the string
        sessionKey = createHash("sha256").update(sessionSecret).digest();
      }
    } else {
      // Hash the string to get exactly 32 bytes
      sessionKey = createHash("sha256").update(sessionSecret).digest();
    }
  } else {
    // Generate a random 32-byte key for development
    sessionKey = randomBytes(32);
    app.log.warn(
      "SESSION_SECRET not set. Using random key (sessions will not persist across restarts).",
    );
  }

  app.register(secureSession, {
    key: sessionKey,
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
