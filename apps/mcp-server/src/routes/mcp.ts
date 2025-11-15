import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type McpContext } from "../mcp/server.js";
import { requireAuth, type AuthContext } from "../lib/auth.js";
import { User } from "@knowledgeplane/db";

// AsyncLocalStorage for per-request context tracking
const contextStorage = new AsyncLocalStorage<McpContext | string>();

export default async function mcpRoutes(app: FastifyInstance) {
  // Map sessionId -> context
  const sessionContexts = new Map<string, McpContext>();

  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Create a single MCP server instance with dynamic context getter
  const mcpServer = createMcpServer(
    app.log,
    () => {
      // First, try to get context from AsyncLocalStorage (for current request)
      const storedContext = contextStorage.getStore();
      if (storedContext && typeof storedContext === "object") {
        return storedContext as McpContext;
      }

      // If stored value is a string, treat it as sessionId and look up in map
      if (storedContext && typeof storedContext === "string") {
        return sessionContexts.get(storedContext);
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
      const apiKey = (request.headers["knowledgeplane-key"] ||
        request.headers["knowledgeplane_key"]) as string | undefined;
      authContext = await requireAuth(request.headers.authorization, apiKey);
    } catch (error: any) {
      return reply.code(401).send({ error: error.message || "unauthorized" });
    }

    const sessionId =
      (request.headers["mcp-session-id"] as string) || undefined;

    // Extract and handle user creation from queryParams
    const query = request.query as Record<string, string>;
    let userId: string | undefined;

    // Prioritize userId from auth context (e.g., from API key or OAuth token)
    // This ensures authenticated users always have userId set
    if (authContext?.userId) {
      userId = authContext.userId;
      app.log.debug({ userId }, "MCP: Using userId from auth context");
    }

    // If no userId from auth context, try to get from query params
    if (!userId && query.username && query.email) {
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

    // Extract knowledge_context from queryParams
    const knowledgeContext = query.knowledge_context;

    // Build context for this request
    const requestContext: McpContext = {};
    if (userId) {
      requestContext.userId = userId;
    }
    if (knowledgeContext) {
      requestContext.knowledgeContext = knowledgeContext;
    }

    // Store context for this session (if sessionId exists)
    if (sessionId && (userId || knowledgeContext)) {
      const existingContext = sessionContexts.get(sessionId) || {};
      sessionContexts.set(sessionId, {
        ...existingContext,
        userId: userId || existingContext.userId,
        knowledgeContext: knowledgeContext || existingContext.knowledgeContext,
      });
    }

    let transport: StreamableHTTPServerTransport;
    let isNewTransport = false;

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
      // If sessionId was provided but doesn't exist (likely server restart),
      // we still use it - the transport will handle reinitialization via MCP protocol
      const newSessionId = sessionId || randomUUID();

      if (sessionId && !transports.has(sessionId)) {
        app.log.info(
          { sessionId },
          "MCP: Server restarted, creating new transport for reconnecting client",
        );
      }

      isNewTransport = true;
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
      app.log.debug(
        {
          sessionId: transport.sessionId || newSessionId,
          isReconnect: !!sessionId && !transports.has(sessionId),
        },
        "MCP: New transport created and connected",
      );
    }

    // Determine the sessionId to use for context
    const effectiveSessionId = transport.sessionId || sessionId || "";

    try {
      // Run the request handler within the async local storage context
      // If we have a sessionId, store it as string for session-based lookup
      // Otherwise, store the context directly for per-request access
      const contextToStore = effectiveSessionId
        ? effectiveSessionId
        : Object.keys(requestContext).length > 0
          ? requestContext
          : undefined;

      // Check if reply was already sent (e.g., by transport initialization)
      if (reply.sent) {
        app.log.warn(
          { sessionId: effectiveSessionId },
          "MCP: Reply already sent, skipping handleRequest",
        );
        return;
      }

      if (contextToStore) {
        await contextStorage.run(contextToStore, async () => {
          await transport.handleRequest(request.raw, reply.raw, request.body);
        });
      } else {
        await transport.handleRequest(request.raw, reply.raw, request.body);
      }

      // Check if reply was sent and log status
      if (reply.sent) {
        // Try to get status code from reply
        const statusCode =
          (reply as any).statusCode || (reply as any).status || "unknown";
        if (statusCode >= 400) {
          app.log.warn(
            {
              sessionId: transport.sessionId || effectiveSessionId,
              statusCode,
              isNewTransport,
              hadSessionId: !!sessionId,
            },
            "MCP: Request completed with error status - client may need to reinitialize",
          );
        }
      }

      // Log if this was a successful reconnect
      if (
        isNewTransport &&
        sessionId &&
        reply.sent &&
        (reply as any).statusCode < 400
      ) {
        app.log.info(
          {
            sessionId: transport.sessionId || sessionId,
          },
          "MCP: Client reconnected after server restart",
        );
      }
    } catch (error: any) {
      app.log.error(
        {
          error: error.message,
          stack: error.stack,
          sessionId: transport.sessionId || effectiveSessionId,
          isNewTransport,
          replySent: reply.sent,
          requestMethod: request.method,
          requestUrl: request.url,
        },
        "MCP: Error handling request",
      );
      if (!reply.sent) {
        reply.code(500).send({ error: error.message });
      }
    }
  });
}
