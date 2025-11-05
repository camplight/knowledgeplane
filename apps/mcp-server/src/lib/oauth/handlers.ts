import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { User } from "@knowledgeplane/db";
import type { OAuthProviderConfig } from "./providers.js";
import type { AuthorizationRequest, AuthorizationCode } from "./types.js";

/**
 * Exchanges authorization code for access token
 */
export async function exchangeCodeForToken(
  config: OAuthProviderConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  const tokenUrl = `${config.tokenHost}${config.tokenPath}`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  // GitHub requires Accept header
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.name === "github") {
    headers.Accept = "application/json";
  }

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(
      `Failed to exchange code for token: ${tokenResponse.status} - ${errorText}`,
    );
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error("No access token received from provider");
  }

  return accessToken;
}

/**
 * Fetches user information from OAuth provider
 */
export async function fetchUserInfo(
  config: OAuthProviderConfig,
  accessToken: string,
): Promise<{ email: string; username: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (config.userInfoHeaders) {
    Object.assign(headers, config.userInfoHeaders);
  }

  const userInfoResponse = await fetch(config.userInfoUrl, {
    headers,
  });

  if (!userInfoResponse.ok) {
    throw new Error(
      `Failed to fetch user info: ${userInfoResponse.status}`,
    );
  }

  const userInfo = await userInfoResponse.json();
  let email = config.getEmail(userInfo);

  // For GitHub, try to fetch email from emails endpoint if not in userInfo
  if (!email && config.fetchEmail) {
    email = await config.fetchEmail(accessToken);
  }

  if (!email) {
    throw new Error("Email is required but not provided by OAuth provider");
  }

  const username = config.getUsername(userInfo);

  return { email, username };
}

/**
 * Creates or retrieves user from database
 */
export async function getOrCreateUser(
  email: string,
  username: string,
): Promise<{ id: string; email: string; username: string }> {
  const user = await User.getOrCreate({
    username,
    email,
  });

  return {
    id: user.id,
    email: user.email,
    username: user.username,
  };
}

/**
 * Handles OAuth callback response (web session or MCP session)
 */
export function handleOAuthCallbackResponse(
  reply: FastifyReply,
  user: { id: string; email: string; username: string },
  accessToken: string,
  provider: string,
  isMcpSession: boolean,
  session: any,
  dashboardRedirectUrl?: string,
) {
  if (isMcpSession) {
    // For MCP sessions, return token info as JSON
    return reply.send({
      success: true,
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      provider,
      message: "Use this token as Bearer token for MCP API calls",
    });
  } else {
    // For web sessions, create a session cookie
    session.userId = user.id;
    session.email = user.email;
    session.username = user.username;
    session.provider = provider;

    // Redirect to dashboard
    const redirectUrl =
      dashboardRedirectUrl ||
      process.env.OAUTH_SUCCESS_REDIRECT_URL ||
      "http://localhost:5173";
    return reply.redirect(`${redirectUrl}/dashboard`);
  }
}

/**
 * Handles OAuth 2.1 authorization code flow
 */
export async function handleOAuth21Flow(
  reply: FastifyReply,
  user: { id: string; email: string; username: string },
  accessToken: string,
  provider: string,
  authRequest: AuthorizationRequest,
  authorizationCodes: {
    set: (code: string, codeData: AuthorizationCode) => Promise<void>;
  },
  authorizationRequests: {
    delete: (key: string) => Promise<void>;
  },
  authRequestKey: string,
  session: any,
) {
  // Generate authorization code
  const authCode = crypto.randomBytes(32).toString("base64url");
  await authorizationCodes.set(authCode, {
    code: authCode,
    client_id: authRequest.client_id,
    redirect_uri: authRequest.redirect_uri,
    code_challenge: authRequest.code_challenge,
    code_challenge_method: authRequest.code_challenge_method,
    user_id: user.id,
    scope: authRequest.scope,
    oauth_access_token: accessToken,
    provider: provider as "google" | "github",
    expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  // Clean up the authorization request
  await authorizationRequests.delete(authRequestKey);
  delete session.authRequestKey;

  // Redirect back to client's redirect_uri with authorization code
  const redirectUrl = new URL(authRequest.redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  if (authRequest.state) {
    redirectUrl.searchParams.set("state", authRequest.state);
  }

  return reply.redirect(redirectUrl.toString());
}

/**
 * Builds OAuth authorization URL for manual redirect
 */
export function buildOAuthUrl(
  config: OAuthProviderConfig,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope.join(" "),
    state: state,
  });

  // Google-specific parameters
  if (config.name === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  return `${config.authorizeHost}${config.authorizePath}?${params.toString()}`;
}

