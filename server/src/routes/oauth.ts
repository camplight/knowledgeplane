import { FastifyInstance } from "fastify";
import fastifyOauth2 from "@fastify/oauth2";
import { User } from "../models/User.js";
import crypto from "crypto";

// Temporary in-memory store for authorization requests and codes
// In production, use Redis or a database with TTL
interface AuthorizationRequest {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  expires_at: number;
}

interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  user_id: string;
  scope?: string;
  oauth_access_token: string; // Store the OAuth provider's access token to return it
  provider: "google" | "github";
  expires_at: number;
}

const authorizationRequests = new Map<string, AuthorizationRequest>();
const authorizationCodes = new Map<string, AuthorizationCode>();

// Clean up expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, req] of authorizationRequests.entries()) {
      if (req.expires_at < now) {
        authorizationRequests.delete(key);
      }
    }
    for (const [key, code] of authorizationCodes.entries()) {
      if (code.expires_at < now) {
        authorizationCodes.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);

// HTML template helper
function getLoginPageHTML(
  provider: "google" | "github",
  redirectPath: string,
): string {
  const providerName = provider === "google" ? "Google" : "GitHub";
  const providerIcon =
    provider === "google"
      ? `<svg class="w-6 h-6" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`
      : `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;
  const providerColor =
    provider === "google"
      ? "bg-[#4285F4] hover:bg-[#357AE8]"
      : "bg-[#24292e] hover:bg-[#1b1f23]";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login with ${providerName} - KnowledgePlane</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Welcome to KnowledgePlane</h1>
      <p class="text-gray-600">Sign in to continue to your shared memory</p>
    </div>
    
    <div class="space-y-4">
      <a href="${redirectPath}" class="flex items-center justify-center gap-3 w-full ${providerColor} text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg">
        ${providerIcon}
        <span>Continue with ${providerName}</span>
      </a>
      
      <div class="relative my-6">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-300"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-2 bg-white text-gray-500">Secure OAuth authentication</span>
        </div>
      </div>
      
      <div class="text-sm text-gray-500 text-center space-y-2">
        <p>By continuing, you agree to share your basic profile information with KnowledgePlane.</p>
        <p class="text-xs">Your data is secure and will only be used for authentication purposes.</p>
      </div>
    </div>
    
    <div class="mt-8 pt-6 border-t border-gray-200">
      <a href="/auth/info" class="block text-center text-sm text-gray-500 hover:text-gray-700">
        View other authentication options
      </a>
    </div>
  </div>
</body>
</html>`;
}

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

  // Google OAuth2
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.register(fastifyOauth2, {
      name: "googleOAuth2",
      credentials: {
        client: {
          id: process.env.GOOGLE_CLIENT_ID,
          secret: process.env.GOOGLE_CLIENT_SECRET,
        },
        auth: fastifyOauth2.GOOGLE_CONFIGURATION,
      },
      startRedirectPath: "/auth/google/redirect",
      callbackUri: `${process.env.OAUTH_REDIRECT_BASE_URL || "http://localhost:8080"}/auth/google/callback`,
      scope: ["openid", "email", "profile"],
    });

    // Serve Google login page
    app.get("/auth/google", async (request, reply) => {
      const query = request.query as any;
      // Check if this is part of an OAuth 2.1 flow (from /authorize)
      const authRequestKey = query.auth_request_key;

      let redirectPath = "/auth/google/redirect";
      if (authRequestKey) {
        // Store the auth request key in session so callback can retrieve it
        const session = await (request as any).session;
        session.authRequestKey = authRequestKey;
        // Add it to redirect path so it's preserved
        redirectPath = `/auth/google/redirect?auth_request_key=${authRequestKey}`;
      }

      return reply
        .type("text/html")
        .send(getLoginPageHTML("google", redirectPath));
    });

    app.get("/auth/google/callback", async function (request, reply) {
      const { token } = await (
        app as any
      ).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      // Get user info from Google
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
          },
        },
      );

      if (!userInfoResponse.ok) {
        app.log.error(
          { status: userInfoResponse.status },
          "Failed to fetch Google user info",
        );
        return reply
          .code(500)
          .send({ error: "Failed to fetch user information" });
      }

      const userInfo = await userInfoResponse.json();
      const email = userInfo.email;
      const username = userInfo.email?.split("@")[0] || userInfo.id;

      // Create or get user
      let user;
      try {
        user = await User.getOrCreate({
          username,
          email,
        });
        app.log.info(
          { userId: user.id, email },
          "Google OAuth: User authenticated",
        );
      } catch (error: any) {
        app.log.error(
          { error: error.message },
          "Google OAuth: Failed to create/get user",
        );
        return reply.code(500).send({ error: "Failed to create user" });
      }

      // Check if this is part of OAuth 2.1 flow (has stored authorization request)
      const session = await (request as any).session;
      const authRequestKey = session?.authRequestKey;

      if (authRequestKey) {
        // This is an OAuth 2.1 authorization code flow
        const authRequest = authorizationRequests.get(authRequestKey);

        if (!authRequest || authRequest.expires_at < Date.now()) {
          return reply.code(400).send({
            error: "invalid_request",
            error_description: "Authorization request expired or not found",
          });
        }

        // Generate authorization code
        const authCode = crypto.randomBytes(32).toString("base64url");
        authorizationCodes.set(authCode, {
          code: authCode,
          client_id: authRequest.client_id,
          redirect_uri: authRequest.redirect_uri,
          code_challenge: authRequest.code_challenge,
          code_challenge_method: authRequest.code_challenge_method,
          user_id: user.id,
          scope: authRequest.scope,
          oauth_access_token: token.access_token, // Store OAuth provider token to return it
          provider: "google",
          expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes
        });

        // Clean up the authorization request
        authorizationRequests.delete(authRequestKey);
        delete session.authRequestKey;

        // Redirect back to client's redirect_uri with authorization code
        const redirectUrl = new URL(authRequest.redirect_uri);
        redirectUrl.searchParams.set("code", authCode);
        if (authRequest.state) {
          redirectUrl.searchParams.set("state", authRequest.state);
        }

        return reply.redirect(redirectUrl.toString());
      }

      // Check if this is an MCP session (has ?mcp=true query param)
      const isMcpSession = (request.query as any)?.mcp === "true";

      if (isMcpSession) {
        // For MCP sessions, return token info as JSON
        // The token can be used as Bearer token for MCP API calls
        return reply.send({
          success: true,
          token: token.access_token, // For MCP, use the OAuth access token
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
          },
          provider: "google",
          message: "Use this token as Bearer token for MCP API calls",
        });
      } else {
        // For web sessions, create a session cookie
        session.userId = user.id;
        session.email = user.email;
        session.username = user.username;
        session.provider = "google";

        // Redirect to dashboard
        return reply.redirect(
          `${process.env.OAUTH_SUCCESS_REDIRECT_URL || "http://localhost:5173"}/dashboard`,
        );
      }
    });
  }

  // GitHub OAuth2
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    app.register(fastifyOauth2, {
      name: "githubOAuth2",
      credentials: {
        client: {
          id: process.env.GITHUB_CLIENT_ID,
          secret: process.env.GITHUB_CLIENT_SECRET,
        },
        auth: {
          authorizeHost: "https://github.com",
          authorizePath: "/login/oauth/authorize",
          tokenHost: "https://github.com",
          tokenPath: "/login/oauth/access_token",
        },
      },
      startRedirectPath: "/auth/github/redirect",
      callbackUri: `${process.env.OAUTH_REDIRECT_BASE_URL || "http://localhost:8080"}/auth/github/callback`,
      scope: ["user:email"],
    });

    // Serve GitHub login page
    app.get("/auth/github", async (request, reply) => {
      const query = request.query as any;
      // Check if this is part of an OAuth 2.1 flow (from /authorize)
      const authRequestKey = query.auth_request_key;

      let redirectPath = "/auth/github/redirect";
      if (authRequestKey) {
        // Store the auth request key in session so callback can retrieve it
        const session = await (request as any).session;
        session.authRequestKey = authRequestKey;
        // Add it to redirect path so it's preserved
        redirectPath = `/auth/github/redirect?auth_request_key=${authRequestKey}`;
      }

      return reply
        .type("text/html")
        .send(getLoginPageHTML("github", redirectPath));
    });

    app.get("/auth/github/callback", async function (request, reply) {
      const { token } = await (
        app as any
      ).githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      // Get user info from GitHub
      const userInfoResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!userInfoResponse.ok) {
        app.log.error(
          { status: userInfoResponse.status },
          "Failed to fetch GitHub user info",
        );
        return reply
          .code(500)
          .send({ error: "Failed to fetch user information" });
      }

      const userInfo = await userInfoResponse.json();

      // Get email from GitHub (may need to fetch from emails endpoint)
      let email = userInfo.email;
      if (!email) {
        const emailsResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );
        if (emailsResponse.ok) {
          const emails = await emailsResponse.json();
          const primaryEmail = emails.find((e: any) => e.primary);
          email = primaryEmail?.email || emails[0]?.email;
        }
      }

      const username = userInfo.login || userInfo.id?.toString();

      if (!email) {
        app.log.error({ userInfo }, "GitHub OAuth: No email found");
        return reply
          .code(400)
          .send({ error: "Email is required but not provided by GitHub" });
      }

      // Create or get user
      let user;
      try {
        user = await User.getOrCreate({
          username,
          email,
        });
        app.log.info(
          { userId: user.id, email },
          "GitHub OAuth: User authenticated",
        );
      } catch (error: any) {
        app.log.error(
          { error: error.message },
          "GitHub OAuth: Failed to create/get user",
        );
        return reply.code(500).send({ error: "Failed to create user" });
      }

      // Check if this is part of OAuth 2.1 flow (has stored authorization request)
      const session = await (request as any).session;
      const authRequestKey = session?.authRequestKey;

      if (authRequestKey) {
        // This is an OAuth 2.1 authorization code flow
        const authRequest = authorizationRequests.get(authRequestKey);

        if (!authRequest || authRequest.expires_at < Date.now()) {
          return reply.code(400).send({
            error: "invalid_request",
            error_description: "Authorization request expired or not found",
          });
        }

        // Generate authorization code
        const authCode = crypto.randomBytes(32).toString("base64url");
        authorizationCodes.set(authCode, {
          code: authCode,
          client_id: authRequest.client_id,
          redirect_uri: authRequest.redirect_uri,
          code_challenge: authRequest.code_challenge,
          code_challenge_method: authRequest.code_challenge_method,
          user_id: user.id,
          scope: authRequest.scope,
          oauth_access_token: token.access_token, // Store OAuth provider token to return it
          provider: "github",
          expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes
        });

        // Clean up the authorization request
        authorizationRequests.delete(authRequestKey);
        delete session.authRequestKey;

        // Redirect back to client's redirect_uri with authorization code
        const redirectUrl = new URL(authRequest.redirect_uri);
        redirectUrl.searchParams.set("code", authCode);
        if (authRequest.state) {
          redirectUrl.searchParams.set("state", authRequest.state);
        }

        return reply.redirect(redirectUrl.toString());
      }

      // Check if this is an MCP session (has ?mcp=true query param)
      const isMcpSession = (request.query as any)?.mcp === "true";

      if (isMcpSession) {
        // For MCP sessions, return token info as JSON
        // The token can be used as Bearer token for MCP API calls
        return reply.send({
          success: true,
          token: token.access_token, // For MCP, use the OAuth access token
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
          },
          provider: "github",
          message: "Use this token as Bearer token for MCP API calls",
        });
      } else {
        // For web sessions, create a session cookie
        session.userId = user.id;
        session.email = user.email;
        session.username = user.username;
        session.provider = "github";

        // Redirect to dashboard
        return reply.redirect(
          `${process.env.OAUTH_SUCCESS_REDIRECT_URL || "http://localhost:5173"}/dashboard`,
        );
      }
    });
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
    return reply.send({
      providers: {
        google: !!(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ),
        github: !!(
          process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ),
      },
      googleLoginUrl: process.env.GOOGLE_CLIENT_ID ? "/auth/google" : null,
      githubLoginUrl: process.env.GITHUB_CLIENT_ID ? "/auth/github" : null,
    });
  });

  // OAuth 2.0 Authorization Server Metadata (RFC8414)
  // This endpoint allows MCP clients to discover OAuth configuration
  app.get("/.well-known/oauth-authorization-server", async (request, reply) => {
    // Determine authorization base URL per MCP spec
    // The authorization base URL is determined by discarding any path component
    let authorizationBaseUrl: string;

    if (process.env.OAUTH_REDIRECT_BASE_URL) {
      const urlObj = new URL(process.env.OAUTH_REDIRECT_BASE_URL);
      authorizationBaseUrl = `${urlObj.protocol}//${urlObj.host}`;
    } else {
      // Build from request
      const protocol = request.protocol || "http";
      const host =
        request.headers.host ||
        `${request.hostname || "localhost"}:${process.env.PORT || 8080}`;
      authorizationBaseUrl = `${protocol}://${host}`;
    }

    const hasGoogle = !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );
    const hasGitHub = !!(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    );

    if (!hasGoogle && !hasGitHub) {
      return reply.code(503).send({
        error: "oauth_configuration_unavailable",
        error_description: "No OAuth providers configured",
      });
    }

    // Return OAuth 2.0 Authorization Server Metadata
    const metadata: any = {
      issuer: authorizationBaseUrl,
      authorization_endpoint: `${authorizationBaseUrl}/authorize`,
      token_endpoint: `${authorizationBaseUrl}/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"], // PKCE required per MCP spec
      scopes_supported: ["openid", "email", "profile"],
      token_endpoint_auth_methods_supported: ["none"], // Public clients (PKCE)
      service_documentation: `${authorizationBaseUrl}/docs`,
    };

    // Add registration endpoint if supported (optional per spec)
    metadata.registration_endpoint = `${authorizationBaseUrl}/register`;

    return reply.send(metadata);
  });

  // OAuth 2.0 Authorization Server Metadata for resource-specific discovery
  // This endpoint allows MCP clients to discover OAuth configuration for a specific resource
  app.get(
    "/.well-known/oauth-authorization-server/:resource",
    async (request, reply) => {
      // Determine authorization base URL
      let authorizationBaseUrl: string;

      if (process.env.OAUTH_REDIRECT_BASE_URL) {
        const urlObj = new URL(process.env.OAUTH_REDIRECT_BASE_URL);
        authorizationBaseUrl = `${urlObj.protocol}//${urlObj.host}`;
      } else {
        const protocol = request.protocol || "http";
        const host =
          request.headers.host ||
          `${request.hostname || "localhost"}:${process.env.PORT || 8080}`;
        authorizationBaseUrl = `${protocol}://${host}`;
      }

      const hasGoogle = !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      );
      const hasGitHub = !!(
        process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      );

      if (!hasGoogle && !hasGitHub) {
        return reply.code(503).send({
          error: "oauth_configuration_unavailable",
          error_description: "No OAuth providers configured",
        });
      }

      // Return the same metadata as the base endpoint (resource-specific config could be added later)
      const metadata: any = {
        issuer: authorizationBaseUrl,
        authorization_endpoint: `${authorizationBaseUrl}/authorize`,
        token_endpoint: `${authorizationBaseUrl}/token`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "email", "profile"],
        token_endpoint_auth_methods_supported: ["none"],
        service_documentation: `${authorizationBaseUrl}/docs`,
        registration_endpoint: `${authorizationBaseUrl}/register`,
      };

      return reply.send(metadata);
    },
  );

  // OAuth 2.0 Protected Resource Metadata (RFC8705)
  // This endpoint allows clients to discover protected resource metadata
  app.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    let authorizationBaseUrl: string;

    if (process.env.OAUTH_REDIRECT_BASE_URL) {
      const urlObj = new URL(process.env.OAUTH_REDIRECT_BASE_URL);
      authorizationBaseUrl = `${urlObj.protocol}//${urlObj.host}`;
    } else {
      const protocol = request.protocol || "http";
      const host =
        request.headers.host ||
        `${request.hostname || "localhost"}:${process.env.PORT || 8080}`;
      authorizationBaseUrl = `${protocol}://${host}`;
    }

    // Return OAuth 2.0 Protected Resource Metadata
    const metadata: any = {
      resource: `${authorizationBaseUrl}/mcp`,
      authorization_servers: [`${authorizationBaseUrl}`],
      jwks_uri: undefined, // We use OAuth provider tokens, not our own JWKS
      scopes_supported: ["openid", "email", "profile"],
    };

    return reply.send(metadata);
  });

  // OAuth 2.0 Protected Resource Metadata for resource-specific discovery
  app.get(
    "/.well-known/oauth-protected-resource/:resource",
    async (request, reply) => {
      const resource = (request.params as any).resource;

      let authorizationBaseUrl: string;

      if (process.env.OAUTH_REDIRECT_BASE_URL) {
        const urlObj = new URL(process.env.OAUTH_REDIRECT_BASE_URL);
        authorizationBaseUrl = `${urlObj.protocol}//${urlObj.host}`;
      } else {
        const protocol = request.protocol || "http";
        const host =
          request.headers.host ||
          `${request.hostname || "localhost"}:${process.env.PORT || 8080}`;
        authorizationBaseUrl = `${protocol}://${host}`;
      }

      // Return OAuth 2.0 Protected Resource Metadata for the specific resource
      const metadata: any = {
        resource: `${authorizationBaseUrl}/${resource}`,
        authorization_servers: [`${authorizationBaseUrl}`],
        jwks_uri: undefined,
        scopes_supported: ["openid", "email", "profile"],
      };

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

    // Store authorization request temporarily (in production, use Redis or database)
    const authRequestKey = crypto.randomBytes(32).toString("base64url");
    authorizationRequests.set(authRequestKey, {
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state || "",
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope: scope || "",
      expires_at: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    const hasGoogle = !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );
    const hasGitHub = !!(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    );

    if (!hasGoogle && !hasGitHub) {
      return reply.code(503).send({
        error: "temporarily_unavailable",
        error_description: "No OAuth providers configured",
      });
    }

    // If only one provider, redirect directly
    if (hasGoogle && !hasGitHub) {
      return reply.redirect(`/auth/google?auth_request_key=${authRequestKey}`);
    }

    if (hasGitHub && !hasGoogle) {
      return reply.redirect(`/auth/github?auth_request_key=${authRequestKey}`);
    }

    // Multiple providers - show selection page (simplified, redirect to first available)
    // In production, you might want a proper selection UI
    return reply.redirect(`/auth/google?auth_request_key=${authRequestKey}`);
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
    const authCodeData = authorizationCodes.get(code);

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
    authorizationCodes.delete(code);

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
