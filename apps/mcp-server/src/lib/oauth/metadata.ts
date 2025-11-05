import type { FastifyRequest, FastifyReply } from "fastify";
import { getAvailableProviders } from "./providers.js";

/**
 * Gets the authorization base URL from request or environment
 */
export function getAuthorizationBaseUrl(request: FastifyRequest): string {
  if (process.env.OAUTH_REDIRECT_BASE_URL) {
    const urlObj = new URL(process.env.OAUTH_REDIRECT_BASE_URL);
    return `${urlObj.protocol}//${urlObj.host}`;
  } else {
    const protocol = request.protocol || "http";
    const host =
      request.headers.host ||
      `${request.hostname || "localhost"}:${process.env.PORT || 8080}`;
    return `${protocol}://${host}`;
  }
}

/**
 * Checks if any OAuth providers are configured
 */
export function hasProviders(): boolean {
  return getAvailableProviders().length > 0;
}

/**
 * Returns OAuth 2.0 Authorization Server Metadata
 */
export function getAuthorizationServerMetadata(
  request: FastifyRequest,
  resource?: string,
): any {
  const authorizationBaseUrl = getAuthorizationBaseUrl(request);

  if (!hasProviders()) {
    return {
      error: "oauth_configuration_unavailable",
      error_description: "No OAuth providers configured",
    };
  }

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
    registration_endpoint: `${authorizationBaseUrl}/register`,
  };

  return metadata;
}

/**
 * Returns OAuth 2.0 Protected Resource Metadata
 */
export function getProtectedResourceMetadata(
  request: FastifyRequest,
  resource?: string,
): any {
  const authorizationBaseUrl = getAuthorizationBaseUrl(request);

  return {
    resource: resource
      ? `${authorizationBaseUrl}/${resource}`
      : `${authorizationBaseUrl}/mcp`,
    authorization_servers: [authorizationBaseUrl],
    jwks_uri: undefined, // We use OAuth provider tokens, not our own JWKS
    scopes_supported: ["openid", "email", "profile"],
  };
}

