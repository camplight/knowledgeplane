import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import session from "@fastify/session";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { init as initDb } from "./lib/db.js";
import health from "./routes/health.js";
import mcp from "./routes/mcp.js";
import oauth from "./routes/oauth.js";
import trpc from "./routes/trpc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    ...(process.env.NODE_ENV === "development" && {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    }),
  },
});

app.register(cors, { 
  origin: process.env.NODE_ENV === "production" 
    ? process.env.FRONTEND_URL || "http://localhost:5173"
    : true,
  credentials: true,
});

// Register cookie and session plugins
app.register(cookie);
app.register(session, {
  secret: process.env.SESSION_SECRET || "change-me-to-a-random-string-in-production",
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

app.register(swagger, {
  openapi: {
    info: {
      title: "knowledgeplane",
      version: "0.1.0",
    },
  },
});
app.register(swaggerUI, {
  routePrefix: "/docs",
});

// Serve static files from web dist in production
if (process.env.NODE_ENV === "production") {
  app.register(staticFiles, {
    root: join(__dirname, "../../web/dist"),
    prefix: "/",
  });
}

await initDb();

app.register(health);
app.register(mcp);
app.register(oauth);
app.register(trpc);

// Serve React app for all non-API routes (SPA routing)
if (process.env.NODE_ENV === "production") {
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/trpc") || 
        request.url.startsWith("/mcp") || 
        request.url.startsWith("/auth") ||
        request.url.startsWith("/docs") ||
        request.url.startsWith("/health") ||
        request.url.startsWith("/.well-known") ||
        request.url.startsWith("/authorize") ||
        request.url.startsWith("/token") ||
        request.url.startsWith("/register")) {
      return reply.code(404).send({ error: "Not found" });
    }
    reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT || 8080);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
