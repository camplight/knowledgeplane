import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyOauth2 from "@fastify/oauth2";
import crypto from "crypto";
import { getLoginPageHTML } from "./templates.js";
import type { OAuthProviderConfig } from "./providers.js";
import {
  exchangeCodeForToken,
  fetchUserInfo,
  getOrCreateUser,
  handleOAuthCallbackResponse,
  handleOAuth21Flow,
  buildOAuthUrl,
} from "./handlers.js";
import {
  authorizationRequests,
  authorizationCodes,
} from "./storage.js";

/**
 * Registers routes for a specific OAuth provider
 */
export function registerProviderRoutes(
  app: FastifyInstance,
  config: OAuthProviderConfig,
): void {
  const providerName = config.name;
  // Use APP_URL (e.g., from DigitalOcean App Platform) or fallback to localhost for development
  const baseUrl = process.env.APP_URL || "http://localhost:8080";

  // Register fastify-oauth2 plugin
  app.register(fastifyOauth2, {
    name: `${providerName}OAuth2`,
    credentials: {
      client: {
        id: config.clientId,
        secret: config.clientSecret,
      },
      auth: {
        authorizeHost: config.authorizeHost,
        authorizePath: config.authorizePath,
        tokenHost: config.tokenHost,
        tokenPath: config.tokenPath,
      },
    },
    startRedirectPath: `/auth/${providerName}/redirect`,
    callbackUri: `${baseUrl}/auth/${providerName}/callback`,
    scope: config.scope,
  });

  // Serve login page
  app.get(`/auth/${providerName}`, async (request, reply) => {
    const query = request.query as any;
    const authRequestKey = query.auth_request_key;

    // For web login, use the manual OAuth flow
    // For MCP OAuth 2.1 flow, use the plugin redirect
    let redirectPath = `/auth/${providerName}/web-redirect`;
    if (authRequestKey) {
      // Store the auth request key in session so callback can retrieve it
      const session = await (request as any).session;
      session.authRequestKey = authRequestKey;
      // For MCP OAuth 2.1 flow, use plugin redirect
      redirectPath = `/auth/${providerName}/redirect?auth_request_key=${authRequestKey}`;
    }

    return reply
      .type("text/html")
      .send(getLoginPageHTML(providerName, redirectPath));
  });

  // Manual web OAuth redirect (bypasses @fastify/oauth2 plugin for web login)
  app.get(`/auth/${providerName}/web-redirect`, async (request, reply) => {
    const session = await (request as any).session;

    // Generate state and store in session
    const state = crypto.randomBytes(32).toString("base64url");
    session.oauthState = state;
    session.oauthProvider = providerName;

    // Build OAuth URL
    const redirectUri = encodeURIComponent(
      `${baseUrl}/auth/${providerName}/web-callback`,
    );
    const authUrl = buildOAuthUrl(config, redirectUri, state);

    return reply.redirect(authUrl);
  });

  // Manual web OAuth callback
  app.get(`/auth/${providerName}/web-callback`, async (request, reply) => {
    const query = request.query as any;
    const code = query.code;
    const state = query.state;
    const error = query.error;

    if (error) {
      app.log.error({ error }, `${providerName} OAuth error`);
      return reply
        .code(400)
        .send({ error: "OAuth error", error_description: error });
    }

    if (!code) {
      return reply.code(400).send({ error: "Missing authorization code" });
    }

    const session = await (request as any).session;

    // Validate state
    if (!state || state !== session?.oauthState) {
      app.log.error(
        { receivedState: state, expectedState: session?.oauthState },
        "Invalid OAuth state",
      );
      return reply.code(400).send({ error: "Invalid state" });
    }

    // Clear state from session
    delete session.oauthState;

    // Exchange code for token
    const redirectUri = `${baseUrl}/auth/${providerName}/web-callback`;

    try {
      const accessToken = await exchangeCodeForToken(
        config,
        code,
        redirectUri,
      );

      // Get user info
      const { email, username } = await fetchUserInfo(config, accessToken);

      // Create or get user
      const user = await getOrCreateUser(email, username);
      app.log.info(
        { userId: user.id, email },
        `${providerName} OAuth: User authenticated (web)`,
      );

      // Check if this is an MCP session
      const isMcpSession = query?.mcp === "true";

      return handleOAuthCallbackResponse(
        reply,
        user,
        accessToken,
        providerName,
        isMcpSession,
        session,
      );
    } catch (error: any) {
      app.log.error(
        { error: error.message },
        `${providerName} OAuth callback error`,
      );
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Plugin-based OAuth callback (for fastify-oauth2)
  app.get(`/auth/${providerName}/callback`, async function (request, reply) {
    const oauth2Plugin = (app as any)[`${providerName}OAuth2`];
    const { token } = await oauth2Plugin.getAccessTokenFromAuthorizationCodeFlow(
      request,
    );

    try {
      // Get user info
      const { email, username } = await fetchUserInfo(
        config,
        token.access_token,
      );

      // Create or get user
      const user = await getOrCreateUser(email, username);
      app.log.info(
        { userId: user.id, email },
        `${providerName} OAuth: User authenticated`,
      );

      // Check if this is part of OAuth 2.1 flow
      const session = await (request as any).session;
      const authRequestKey = session?.authRequestKey;

      if (authRequestKey) {
        const authRequest = await authorizationRequests.get(authRequestKey);

        if (!authRequest || authRequest.expires_at < Date.now()) {
          return reply.code(400).send({
            error: "invalid_request",
            error_description: "Authorization request expired or not found",
          });
        }

        return await handleOAuth21Flow(
          reply,
          user,
          token.access_token,
          providerName,
          authRequest,
          authorizationCodes,
          authorizationRequests,
          authRequestKey,
          session,
        );
      }

      // Check if this is an MCP session
      const isMcpSession = (request.query as any)?.mcp === "true";

      return handleOAuthCallbackResponse(
        reply,
        user,
        token.access_token,
        providerName,
        isMcpSession,
        session,
      );
    } catch (error: any) {
      app.log.error(
        { error: error.message },
        `${providerName} OAuth: Failed to process callback`,
      );
      return reply.code(500).send({ error: "Failed to process authentication" });
    }
  });
}

