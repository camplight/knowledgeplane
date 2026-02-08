import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type McpContext } from "../mcp/server.js";
import { requireAuth, type AuthContext } from "@knowledgeplane/db";
import { User, WorkspaceMember } from "@knowledgeplane/db";

// AsyncLocalStorage for per-request context tracking
const contextStorage = new AsyncLocalStorage<McpContext | string>();

export default async function mcpRoutes(app: FastifyInstance) {
  // Map sessionId -> context
  const sessionContexts = new Map<string, McpContext>();

  // Map sessionId -> auth context (for reusing auth from GET requests)
  const sessionAuth = new Map<string, AuthContext>();

  const transports = new Map<string, StreamableHTTPServerTransport>();
  const sessionServers = new Map<string, ReturnType<typeof createMcpServer>>();

  const getContextFromStorage = () => {
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
  };

  // Streamable HTTP endpoint for MCP protocol
  // Register at both /mcp and / to support different routing scenarios:
  // - /mcp: for direct access or subdomain routing
  // - /: for path-based routing where App Platform strips the /mcp prefix
  const mcpHandler = async (request: any, reply: any) => {
    // Log ALL incoming requests to this handler for debugging
    app.log.info(
      {
        method: request.method,
        url: request.url,
        headers: {
          "mcp-session-id": request.headers["mcp-session-id"],
          "content-type": request.headers["content-type"],
          "content-length": request.headers["content-length"],
        },
        query: request.query,
        hasBody: !!request.body,
        bodyType: typeof request.body,
      },
      "MCP: Incoming request",
    );

    // For / route, only handle MCP protocol requests to avoid conflicts with other routes
    // Check if this looks like an MCP request (has mcp-session-id header or POST with JSON body)
    const hasSessionId = !!request.headers["mcp-session-id"];
    const isPost = request.method === "POST";
    if (request.url === "/" && !hasSessionId && !isPost) {
      // Not an MCP request, let other routes handle it
      app.log.debug({ url: request.url }, "MCP: Skipping non-MCP request to /");
      return;
    }

    // Extract query params first (needed for API key from query and user creation)
    const query = request.query as Record<string, string>;
    const workspaceIdFromQuery = query.workspace_id as string | undefined;

    // Check if this is a JSON-RPC initialize request - these might not have auth yet
    const requestBody = request.body as any;
    const isInitializeRequest =
      requestBody &&
      typeof requestBody === "object" &&
      requestBody.method === "initialize";

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
      // For initialize requests, allow them to proceed without auth
      // The transport will handle initialization, and we can authenticate later
      // Also check if we have auth from a previous GET request for this session
      const sessionIdFromHeader = request.headers["mcp-session-id"] as
        | string
        | undefined;
      if (isInitializeRequest || sessionIdFromHeader) {
        // Try to get auth from previous GET request for this session
        if (sessionIdFromHeader && sessionAuth.has(sessionIdFromHeader)) {
          authContext = sessionAuth.get(sessionIdFromHeader);
          app.log.debug(
            { sessionId: sessionIdFromHeader },
            "MCP: Using auth from previous GET request",
          );
        } else if (isInitializeRequest) {
          app.log.debug(
            {
              error: error.message,
              hasApiKey: !!query.api_key,
              hasAuthHeader: !!request.headers.authorization,
            },
            "MCP: Initialize request without auth - allowing to proceed",
          );
          // Set authContext to undefined - we'll try to authenticate after initialization
          authContext = undefined;
        } else {
          app.log.warn(
            {
              error: error.message,
              hasApiKey: !!query.api_key,
              hasAuthHeader: !!request.headers.authorization,
            },
            "MCP: Authentication failed",
          );
          return reply
            .code(401)
            .send({ error: error.message || "unauthorized" });
        }
      } else {
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

    // For POST requests, try to find existing transport by session ID
    // If no session ID provided, create a new one (OpenAI might not send session ID initially)
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
      // For POST requests without session ID, create a new session (OpenAI might not send it)
      const newSessionId = sessionId || randomUUID();

      if (sessionId && !transports.has(sessionId)) {
        app.log.info(
          { sessionId },
          "MCP: Server restarted, creating new transport for reconnecting client",
        );
      } else if (!sessionId && request.method === "POST") {
        app.log.info(
          { newSessionId, requestMethod: request.method },
          "MCP: Creating new transport for POST request without session ID",
        );
      }

      isNewTransport = true;
      const transportServer = createMcpServer(
        app.log,
        getContextFromStorage,
        sessionContexts,
      );

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (id: string) => {
          transports.set(id, transport);
          sessionServers.set(id, transportServer);
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
          sessionServers.delete(id);
          app.log.info({ sessionId: id }, "MCP: Session closed");
        },
      });

      // Set up close handler
      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
          sessionContexts.delete(transport.sessionId);
          sessionServers.delete(transport.sessionId);
          app.log.debug(
            { sessionId: transport.sessionId },
            "MCP: Transport closed",
          );
        }
      };

      // Connect transport to a dedicated server instance
      await transportServer.connect(transport);
      app.log.debug(
        {
          sessionId: transport.sessionId || newSessionId,
          isReconnect: !!sessionId && !transports.has(sessionId),
          requestMethod: request.method,
        },
        "MCP: New transport created and connected",
      );
    }

    // Determine the sessionId to use for context
    const effectiveSessionId = transport.sessionId || sessionId || "";

    try {
      // Handle GET requests specially - they're used for connection establishment/polling
      // For GET requests without a JSON-RPC body, create session and return session info
      const requestBody = request.body as any;
      const hasJsonRpcBody =
        requestBody &&
        typeof requestBody === "object" &&
        (requestBody.jsonrpc || requestBody.method);

      if (request.method === "GET" && !hasJsonRpcBody) {
        // Store context for the session
        if (effectiveSessionId && Object.keys(requestContext).length > 0) {
          sessionContexts.set(effectiveSessionId, requestContext);
        }

        // Store auth context for this session so POST requests can reuse it
        if (effectiveSessionId && authContext) {
          sessionAuth.set(effectiveSessionId, authContext);
          app.log.debug(
            { sessionId: effectiveSessionId },
            "MCP: Stored auth context for session",
          );
        }

        // For GET requests, return a simple success response
        // OpenAI will then make POST requests with JSON-RPC messages
        reply.header("mcp-session-id", effectiveSessionId);
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        reply.header(
          "Access-Control-Allow-Headers",
          "Content-Type, mcp-session-id",
        );
        return reply.code(200).send({
          jsonrpc: "2.0",
          result: {
            sessionId: effectiveSessionId,
            status: "connected",
          },
          id: null,
        });
      }

      // Handle OPTIONS requests for CORS preflight
      if (request.method === "OPTIONS") {
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        reply.header(
          "Access-Control-Allow-Headers",
          "Content-Type, mcp-session-id",
        );
        return reply.code(204).send();
      }

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
      if (requestBody && typeof requestBody === "object") {
        app.log.debug(
          {
            method: requestBody.method,
            sessionId: effectiveSessionId,
            hasContext: !!contextToStore,
            requestMethod: request.method,
            hasBody: !!request.body,
          },
          "MCP: Handling request",
        );
      } else {
        app.log.debug(
          {
            requestMethod: request.method,
            hasBody: !!request.body,
            sessionId: effectiveSessionId,
          },
          "MCP: Handling request (no JSON-RPC body)",
        );
      }

      try {
        if (contextToStore) {
          await contextStorage.run(contextToStore, async () => {
            await transport.handleRequest(request.raw, reply.raw, request.body);
          });
        } else {
          await transport.handleRequest(request.raw, reply.raw, request.body);
        }
      } catch (transportError: any) {
        app.log.error(
          {
            error: transportError.message,
            stack: transportError.stack,
            sessionId: transport.sessionId || effectiveSessionId,
            requestMethod: request.method,
          },
          "MCP: Transport handleRequest error",
        );
        if (!reply.sent) {
          reply.code(500).send({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: transportError.message || "Internal error",
            },
            id: requestBody?.id || null,
          });
        }
        return;
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
              requestMethod: request.method,
            },
            "MCP: Request completed with error status - client may need to reinitialize",
          );
        } else {
          app.log.debug(
            {
              sessionId: transport.sessionId || effectiveSessionId,
              statusCode,
              requestMethod: request.method,
            },
            "MCP: Request completed successfully",
          );
        }
      } else {
        app.log.warn(
          {
            sessionId: transport.sessionId || effectiveSessionId,
            requestMethod: request.method,
          },
          "MCP: Request completed but no reply was sent",
        );
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

  // Add error handler to catch any errors before they reach the handler
  app.addHook("onRequest", async (request, reply) => {
    // Only log for MCP routes
    if (request.url.startsWith("/mcp") || request.url === "/") {
      app.log.debug(
        {
          method: request.method,
          url: request.url,
          headers: request.headers,
        },
        "MCP: onRequest hook - request received",
      );
    }
  });

  // Add error handler to catch errors
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number; message?: string; stack?: string };
    if (request.url.startsWith("/mcp") || request.url === "/") {
      app.log.error(
        {
          error: err.message,
          stack: err.stack,
          method: request.method,
          url: request.url,
        },
        "MCP: Error handler - request failed",
      );
    }
    reply.code(err.statusCode || 500).send({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: err.message || "Internal error",
      },
      id: null,
    });
  });

  // Register handler at both /mcp and / to support different routing scenarios:
  // - /mcp: for direct access or subdomain routing (e.g., https://mcp.domain.com/mcp)
  // - /: for path-based routing where App Platform strips the /mcp prefix
  //    (e.g., route /mcp → service receives /)
  app.all("/mcp", mcpHandler);
  app.all("/", mcpHandler);

  // Add a test endpoint to verify POST requests work
  app.post("/mcp/test", async (request, reply) => {
    app.log.info(
      {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
      },
      "MCP: Test POST endpoint called",
    );
    return reply.code(200).send({
      jsonrpc: "2.0",
      result: { status: "ok", message: "POST requests are working" },
      id: null,
    });
  });
}
