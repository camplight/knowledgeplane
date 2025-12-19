import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type McpContext } from "../mcp/server.js";
import { requireAuth, type AuthContext } from "../lib/auth.js";
import { User, WorkspaceMember } from "@knowledgeplane/db";

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
  // Register at both /mcp and / to support different routing scenarios:
  // - /mcp: for direct access or subdomain routing
  // - /: for path-based routing where App Platform strips the /mcp prefix
  const mcpHandler = async (request: any, reply: any) => {
    // For / route, only handle MCP protocol requests to avoid conflicts with other routes
    // Check if this looks like an MCP request (has mcp-session-id header or POST with JSON body)
    if (request.url === "/" && !request.headers["mcp-session-id"] && request.method !== "POST") {
      // Not an MCP request, let other routes handle it
      return;
    }

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

    // Extract query params first (needed for API key from query and user creation)
    const query = request.query as Record<string, string>;
    const workspaceIdFromQuery = query.workspace_id as string | undefined;

    let authContext: AuthContext | undefined;
    try {
      // Check for API key in multiple places (priority order):
      // 1. Header (knowledgeplane-key or knowledgeplane_key)
      // 2. Query parameter (api_key) - for internal use when headers can't be set
      const apiKeyFromHeader = (request.headers["knowledgeplane-key"] ||
        request.headers["knowledgeplane_key"]) as string | undefined;
      const apiKeyFromQuery = query.api_key as string | undefined;
      const apiKey = apiKeyFromHeader || apiKeyFromQuery;

      authContext = await requireAuth(request.headers.authorization, apiKey);
    } catch (error: any) {
      app.log.warn(
        {
          error: error.message,
          hasApiKey: !!query.api_key,
          hasAuthHeader: !!request.headers.authorization,
        },
        "MCP: Authentication failed",
      );
      return reply.code(401).send({ error: error.message || "unauthorized" });
    }

    const sessionId =
      (request.headers["mcp-session-id"] as string) || undefined;

    // Extract and handle user creation from queryParams
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

    // Get workspace_id - prioritize from query, then get user's first workspace
    let workspaceId: string | undefined = workspaceIdFromQuery;
    if (!workspaceId && userId) {
      try {
        const userWorkspaces = await WorkspaceMember.findByUser(userId, 1, 0);
        if (userWorkspaces.length > 0) {
          workspaceId = userWorkspaces[0].workspace_id;
        }
      } catch (error: any) {
        app.log.warn(
          { error: error.message, userId },
          "MCP: Failed to get user's workspaces",
        );
      }
    }

    // Build context for this request
    const requestContext: McpContext = {};
    if (userId) {
      requestContext.userId = userId;
    }
    if (workspaceId) {
      requestContext.workspaceId = workspaceId;
    }

    // Store context for this session (if sessionId exists)
    if (sessionId && userId) {
      const existingContext = sessionContexts.get(sessionId) || {};
      sessionContexts.set(sessionId, {
        ...existingContext,
        userId: userId || existingContext.userId,
        workspaceId: workspaceId || existingContext.workspaceId,
      });
    }

    let transport: StreamableHTTPServerTransport;
    let isNewTransport = false;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      transport = transports.get(sessionId)!;
      app.log.debug({ sessionId }, "MCP: Reusing existing transport");

      // Update context for existing session if new params provided
      if (userId) {
        const existingContext = sessionContexts.get(sessionId) || {};
        sessionContexts.set(sessionId, {
          ...existingContext,
          userId: userId || existingContext.userId,
          workspaceId: workspaceId || existingContext.workspaceId,
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
          if (userId) {
            sessionContexts.set(id, {
              userId,
              workspaceId,
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

      // Log request details for debugging
      const requestBody = request.body as any;
      if (requestBody && typeof requestBody === "object") {
        app.log.debug(
          {
            method: requestBody.method,
            sessionId: effectiveSessionId,
            hasContext: !!contextToStore,
          },
          "MCP: Handling request",
        );
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
  };

  // Register handler at both /mcp and / to support different routing scenarios:
  // - /mcp: for direct access or subdomain routing (e.g., https://mcp.domain.com/mcp)
  // - /: for path-based routing where App Platform strips the /mcp prefix
  //    (e.g., route /mcp → service receives /)
  app.all("/mcp", mcpHandler);
  app.all("/", mcpHandler);
}
