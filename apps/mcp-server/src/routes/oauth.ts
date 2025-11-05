import { FastifyInstance } from "fastify";
import crypto from "crypto";
import {
  createProviderConfig,
  getAvailableProviders,
} from "../lib/oauth/providers.js";
import { registerProviderRoutes } from "../lib/oauth/routes.js";
import {
  authorizationRequests,
  authorizationCodes,
} from "../lib/oauth/storage.js";
import {
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
} from "../lib/oauth/metadata.js";

export default async function oauthRoutes(app: FastifyInstance) {
  // Register content type parser for application/x-www-form-urlencoded
  // Required for OAuth 2.1 token endpoint (RFC 6749)
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (request, body, done) => {
      try {
        const params = new URLSearchParams(body as string);
        const parsed: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
          parsed[key] = value;
        }
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Register routes for each available OAuth provider
  const googleConfig = createProviderConfig("google");
  if (googleConfig) {
    registerProviderRoutes(app, googleConfig);
  }

  const githubConfig = createProviderConfig("github");
  if (githubConfig) {
    registerProviderRoutes(app, githubConfig);
  }

  // Success page (for testing/debugging)
  app.get("/auth/success", async (request, reply) => {
    const query = request.query as Record<string, string>;
    return reply.send({
      success: true,
      message: "Authentication successful",
      userId: query.userId,
      email: query.email,
      provider: query.provider,
    });
  });

  // Auth info endpoint
  app.get("/auth/info", async (request, reply) => {
    const providers = getAvailableProviders();
    return reply.send({
      providers: {
        google: providers.includes("google"),
        github: providers.includes("github"),
      },
      googleLoginUrl: providers.includes("google") ? "/auth/google" : null,
      githubLoginUrl: providers.includes("github") ? "/auth/github" : null,
    });
  });

  // OAuth 2.0 Authorization Server Metadata (RFC8414)
  // This endpoint allows MCP clients to discover OAuth configuration
  app.get("/.well-known/oauth-authorization-server", async (request, reply) => {
    const metadata = getAuthorizationServerMetadata(request);
    if (metadata.error) {
      return reply.code(503).send(metadata);
    }
    return reply.send(metadata);
  });

  // OAuth 2.0 Authorization Server Metadata for resource-specific discovery
  app.get(
    "/.well-known/oauth-authorization-server/:resource",
    async (request, reply) => {
      const resource = (request.params as any).resource;
      const metadata = getAuthorizationServerMetadata(request, resource);
      if (metadata.error) {
        return reply.code(503).send(metadata);
      }
      return reply.send(metadata);
    },
  );

  // OAuth 2.0 Protected Resource Metadata (RFC8705)
  // This endpoint allows clients to discover protected resource metadata
  app.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    const metadata = getProtectedResourceMetadata(request);
    return reply.send(metadata);
  });

  // OAuth 2.0 Protected Resource Metadata for resource-specific discovery
  app.get(
    "/.well-known/oauth-protected-resource/:resource",
    async (request, reply) => {
      const resource = (request.params as any).resource;
      const metadata = getProtectedResourceMetadata(request, resource);
      return reply.send(metadata);
    },
  );

  // OAuth 2.1 Authorization Endpoint
  // Handles authorization requests and redirects to appropriate OAuth provider
  app.get("/authorize", async (request, reply) => {
    const query = request.query as any;

    // Validate required OAuth parameters
    const clientId = query.client_id;
    const redirectUri = query.redirect_uri;
    const responseType = query.response_type;
    const scope = query.scope;
    const state = query.state;
    const codeChallenge = query.code_challenge;
    const codeChallengeMethod = query.code_challenge_method;

    // Validate required parameters
    if (!clientId) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description: "Missing required parameter: client_id",
      });
    }

    if (!redirectUri) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description: "Missing required parameter: redirect_uri",
      });
    }

    // Validate redirect URI (must be localhost or HTTPS)
    try {
      const redirectUrlObj = new URL(redirectUri);
      if (
        redirectUrlObj.protocol !== "https:" &&
        redirectUrlObj.hostname !== "localhost" &&
        redirectUrlObj.hostname !== "127.0.0.1"
      ) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "redirect_uri must be localhost or HTTPS",
        });
      }
    } catch (e) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description: "Invalid redirect_uri format",
      });
    }

    if (responseType !== "code") {
      return reply.code(400).send({
        error: "unsupported_response_type",
        error_description: "Only 'code' response type is supported",
      });
    }

    // PKCE is required per MCP spec
    if (!codeChallenge || codeChallengeMethod !== "S256") {
      return reply.code(400).send({
        error: "invalid_request",
        error_description:
          "PKCE is required. code_challenge and code_challenge_method=S256 are required",
      });
    }

    // Store authorization request in database
    const authRequestKey = crypto.randomBytes(32).toString("base64url");
    await authorizationRequests.set(authRequestKey, {
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state || "",
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope: scope || "",
      expires_at: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    const providers = getAvailableProviders();

    if (providers.length === 0) {
      return reply.code(503).send({
        error: "temporarily_unavailable",
        error_description: "No OAuth providers configured",
      });
    }

    // If only one provider, redirect directly
    if (providers.length === 1) {
      return reply.redirect(
        `/auth/${providers[0]}?auth_request_key=${authRequestKey}`,
      );
    }

    // Multiple providers - show selection page (simplified, redirect to first available)
    // In production, you might want a proper selection UI
    return reply.redirect(
      `/auth/${providers[0]}?auth_request_key=${authRequestKey}`,
    );
  });

  // OAuth 2.1 Token Endpoint
  // Exchanges authorization code for access token
  app.post("/token", async (request, reply) => {
    const body = request.body as any;

    const grantType = body.grant_type;
    const code = body.code;
    const redirectUri = body.redirect_uri;
    const clientId = body.client_id;
    const codeVerifier = body.code_verifier;

    if (grantType !== "authorization_code") {
      return reply.code(400).send({
        error: "unsupported_grant_type",
        error_description: "Only 'authorization_code' grant type is supported",
      });
    }

    if (!code) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description: "Missing required parameter: code",
      });
    }

    if (!codeVerifier) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description:
          "Missing required parameter: code_verifier (PKCE required)",
      });
    }

    // Retrieve and validate authorization code
    const authCodeData = await authorizationCodes.get(code);

    if (!authCodeData || authCodeData.expires_at < Date.now()) {
      return reply.code(400).send({
        error: "invalid_grant",
        error_description: "Authorization code expired or invalid",
      });
    }

    // Verify client_id matches
    if (clientId && authCodeData.client_id !== clientId) {
      return reply.code(400).send({
        error: "invalid_client",
        error_description: "Client ID mismatch",
      });
    }

    // Verify redirect_uri matches
    if (redirectUri && authCodeData.redirect_uri !== redirectUri) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description: "Redirect URI mismatch",
      });
    }

    // Verify PKCE code challenge
    if (authCodeData.code_challenge_method === "S256") {
      const hash = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      if (hash !== authCodeData.code_challenge) {
        return reply.code(400).send({
          error: "invalid_grant",
          error_description: "Invalid code verifier (PKCE verification failed)",
        });
      }
    } else {
      // Plain method is not recommended, but handle it if needed
      if (codeVerifier !== authCodeData.code_challenge) {
        return reply.code(400).send({
          error: "invalid_grant",
          error_description: "Invalid code verifier",
        });
      }
    }

    // Clean up the authorization code (single use)
    await authorizationCodes.delete(code);

    // Return the OAuth provider's access token
    // This token can be validated by the existing auth system (validateGoogleToken/validateGitHubToken)
    // which validates tokens directly with the OAuth provider
    return reply.send({
      access_token: authCodeData.oauth_access_token,
      token_type: "Bearer",
      expires_in: 3600, // 1 hour (approximate, actual expiry depends on provider)
      scope: authCodeData.scope || "openid email profile",
    });
  });

  // Dynamic Client Registration Endpoint (optional per MCP spec)
  app.post("/register", async (request, reply) => {
    // Per MCP spec, servers SHOULD support dynamic client registration
    // For now, return a simple response indicating clients can use any client_id
    const body = request.body as any;

    const clientName = body.client_name || "MCP Client";
    const redirectUris = body.redirect_uris || [];

    // Validate redirect URIs
    for (const uri of redirectUris) {
      try {
        const urlObj = new URL(uri);
        if (
          urlObj.protocol !== "https:" &&
          urlObj.hostname !== "localhost" &&
          urlObj.hostname !== "127.0.0.1"
        ) {
          return reply.code(400).send({
            error: "invalid_redirect_uri",
            error_description: "All redirect_uris must be localhost or HTTPS",
          });
        }
      } catch (e) {
        return reply.code(400).send({
          error: "invalid_redirect_uri",
          error_description: "Invalid redirect_uri format",
        });
      }
    }

    // Generate a client_id (in production, store this)
    const clientId = `mcp-client-${Date.now()}`;

    return reply.send({
      client_id: clientId,
      client_secret: undefined, // Public clients don't need secrets (PKCE used instead)
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      client_name: clientName,
      token_endpoint_auth_method: "none", // Public clients
    });
  });
}
