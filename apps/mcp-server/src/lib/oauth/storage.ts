import {
  OAuthAuthorizationRequest,
  OAuthAuthorizationCode,
  type AuthorizationRequestInput,
  type AuthorizationCodeInput,
} from "@knowledgeplane/db";
import type { AuthorizationRequest, AuthorizationCode } from "./types.js";

/**
 * Convert AuthorizationRequest to database input format
 */
function toRequestInput(
  key: string,
  request: AuthorizationRequest,
): AuthorizationRequestInput {
  return {
    key,
    client_id: request.client_id,
    redirect_uri: request.redirect_uri,
    state: request.state,
    code_challenge: request.code_challenge,
    code_challenge_method: request.code_challenge_method,
    scope: request.scope,
    expires_at: request.expires_at,
  };
}

/**
 * Convert AuthorizationCode to database input format
 */
function toCodeInput(code: AuthorizationCode): AuthorizationCodeInput {
  return {
    code: code.code,
    client_id: code.client_id,
    redirect_uri: code.redirect_uri,
    code_challenge: code.code_challenge,
    code_challenge_method: code.code_challenge_method,
    user_id: code.user_id,
    scope: code.scope,
    oauth_access_token: code.oauth_access_token,
    provider: code.provider,
    expires_at: code.expires_at,
  };
}

/**
 * Database-backed storage for OAuth authorization requests and codes
 */
export const authorizationRequests = {
  async set(key: string, request: AuthorizationRequest): Promise<void> {
    await OAuthAuthorizationRequest.create(toRequestInput(key, request));
  },

  async get(key: string): Promise<AuthorizationRequest | null> {
    const record = await OAuthAuthorizationRequest.findByKey(key);
    if (!record) {
      return null;
    }

    return {
      client_id: record.client_id,
      redirect_uri: record.redirect_uri,
      state: record.state,
      code_challenge: record.code_challenge,
      code_challenge_method: record.code_challenge_method,
      scope: record.scope || undefined,
      expires_at: record.expires_at.getTime(),
    };
  },

  async delete(key: string): Promise<void> {
    await OAuthAuthorizationRequest.delete(key);
  },
};

export const authorizationCodes = {
  async set(code: string, codeData: AuthorizationCode): Promise<void> {
    await OAuthAuthorizationCode.create(toCodeInput(codeData));
  },

  async get(code: string): Promise<AuthorizationCode | null> {
    const record = await OAuthAuthorizationCode.findByCode(code);
    if (!record) {
      return null;
    }

    return {
      code: record.code,
      client_id: record.client_id,
      redirect_uri: record.redirect_uri,
      code_challenge: record.code_challenge,
      code_challenge_method: record.code_challenge_method,
      user_id: record.user_id,
      scope: record.scope || undefined,
      oauth_access_token: record.oauth_access_token,
      provider: record.provider,
      expires_at: record.expires_at.getTime(),
    };
  },

  async delete(code: string): Promise<void> {
    await OAuthAuthorizationCode.delete(code);
  },
};

// Clean up expired entries every 5 minutes
setInterval(
  async () => {
    try {
      await OAuthAuthorizationRequest.cleanupExpired();
      await OAuthAuthorizationCode.cleanupExpired();
    } catch (error) {
      console.error("Error cleaning up expired OAuth entries:", error);
    }
  },
  5 * 60 * 1000,
);
