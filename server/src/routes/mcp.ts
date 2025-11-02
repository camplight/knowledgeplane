import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type McpContext } from "../mcp/server.js";
import { requireAuth, type AuthContext } from "../lib/auth.js";
import { User } from "../models/User.js";

// AsyncLocalStorage for per-request session tracking
const sessionStorage = new AsyncLocalStorage<string>();

export default async function mcpRoutes(app: FastifyInstance) {
  // Map sessionId -> context
  const sessionContexts = new Map<string, McpContext>();

  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Create a single MCP server instance with dynamic context getter
  const mcpServer = createMcpServer(
    app.log,
    () => {
      const currentSessionId = sessionStorage.getStore();
      if (currentSessionId) {
        return sessionContexts.get(currentSessionId);
      }
      return undefined;
    },
    sessionContexts,
  );

  // Streamable HTTP endpoint for MCP protocol
  app.all("/mcp", async (request, reply) => {
    app.log.debug(
      {
        method: request.method,
        url: request.url,
        headers: {
          "mcp-session-id": request.headers["mcp-session-id"],
          "content-type": request.headers["content-type"],
        },
        query: request.query,
      },
      "MCP: Incoming request",
    );

    let authContext: AuthContext | undefined;
    try {
      // Check for API key header (case-insensitive - Fastify normalizes to lowercase)
      // Support both hyphen and underscore variants, and original case
      const apiKey = (request.headers["memoryplane-key"] ||
        request.headers["memoryplane_key"] ||
        request.headers["MEMORYPLANE_KEY"]) as string | undefined;
      authContext = await requireAuth(request.headers.authorization, apiKey);
    } catch (error: any) {
      return reply.code(401).send({ error: error.message || "unauthorized" });
    }

    const sessionId =
      (request.headers["mcp-session-id"] as string) || undefined;

    // Extract and handle user creation from queryParams
    const query = request.query as Record<string, string>;
    let userId: string | undefined;

    // First, try to get userId from query params
    if (query.username && query.email) {
      try {
        const user = await User.getOrCreate({
          username: query.username,
          email: query.email,
        });
        userId = user.id;
        app.log.info(
          { userId, username: query.username },
          "MCP: User created/retrieved from queryParams",
        );
      } catch (error: any) {
        app.log.error(
          { error: error.message },
          "MCP: Failed to create/retrieve user",
        );
        // Continue without user - handlers will need to get userId from args
      }
    }

    // If no userId from query params, use userId from auth context (e.g., from API key auth)
    if (!userId && authContext?.userId) {
      userId = authContext.userId;
      app.log.debug({ userId }, "MCP: Using userId from auth context");
    }

    // Extract knowledge_context from queryParams
    const knowledgeContext = query.knowledge_context;

    // Store context for this session
    if (sessionId && (userId || knowledgeContext)) {
      const existingContext = sessionContexts.get(sessionId) || {};
      sessionContexts.set(sessionId, {
        ...existingContext,
        userId: userId || existingContext.userId,
        knowledgeContext: knowledgeContext || existingContext.knowledgeContext,
      });
    }

    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      transport = transports.get(sessionId)!;
      app.log.debug({ sessionId }, "MCP: Reusing existing transport");

      // Update context for existing session if new params provided
      if (userId || knowledgeContext) {
        const existingContext = sessionContexts.get(sessionId) || {};
        sessionContexts.set(sessionId, {
          ...existingContext,
          userId: userId || existingContext.userId,
          knowledgeContext:
            knowledgeContext || existingContext.knowledgeContext,
        });
      }
    } else {
      // Create new transport for initialization
      const newSessionId = sessionId || randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (id: string) => {
          transports.set(id, transport);
          // Set context for new session if available
          if (userId || knowledgeContext) {
            sessionContexts.set(id, {
              userId,
              knowledgeContext,
            });
          }
          app.log.info({ sessionId: id }, "MCP: Session initialized");
        },
        onsessionclosed: (id: string) => {
          transports.delete(id);
          sessionContexts.delete(id);
          app.log.info({ sessionId: id }, "MCP: Session closed");
        },
      });

      // Set up close handler
      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
          sessionContexts.delete(transport.sessionId);
          app.log.debug(
            { sessionId: transport.sessionId },
            "MCP: Transport closed",
          );
        }
      };

      // Connect transport to shared server
      await mcpServer.connect(transport);
      app.log.debug("MCP: New transport created and connected");
    }

    // Determine the sessionId to use for context
    const effectiveSessionId = sessionId || transport.sessionId || "";

    try {
      // Run the request handler within the async local storage context
      await sessionStorage.run(effectiveSessionId, async () => {
        await transport.handleRequest(request.raw, reply.raw, request.body);
      });
    } catch (error: any) {
      app.log.error(
        {
          error: error.message,
          stack: error.stack,
          sessionId: transport.sessionId,
        },
        "MCP: Error handling request",
      );
      if (!reply.sent) {
        reply.code(500).send({ error: error.message });
      }
    }
  });
}
