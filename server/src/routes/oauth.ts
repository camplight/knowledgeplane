import { FastifyInstance } from "fastify";
import fastifyOauth2 from "@fastify/oauth2";
import { User } from "../models/User.js";

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
      return reply
        .type("text/html")
        .send(getLoginPageHTML("google", "/auth/google/redirect"));
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
        const session = await (request as any).session;
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
      return reply
        .type("text/html")
        .send(getLoginPageHTML("github", "/auth/github/redirect"));
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
        const session = await (request as any).session;
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
}
