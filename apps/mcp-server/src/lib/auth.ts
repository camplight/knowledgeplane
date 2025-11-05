import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { JwksClient } from "jwks-rsa";
import { User } from "@knowledgeplane/db";

export interface AuthContext {
  userId: string;
  email?: string;
  provider?: "google" | "github";
  [key: string]: any;
}

// Lazy initialization of JWKS clients
const googleJwksClient = jwksClient({
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  requestHeaders: {},
  timeout: 30000,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    return callback(new Error("No kid in header"));
  }

  googleJwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Validates a Google OAuth token by fetching user info
 */
async function validateGoogleToken(token: string): Promise<AuthContext> {
  try {
    // First, try to decode and verify as JWT (Google ID tokens)
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (decoded && typeof decoded === "object" && decoded.payload) {
        const payload = decoded.payload as any;

        // Verify Google ID token signature
        if (
          payload.iss === "https://accounts.google.com" ||
          payload.iss === "accounts.google.com"
        ) {
          await new Promise<void>((resolve, reject) => {
            jwt.verify(
              token,
              getKey,
              {
                issuer: ["https://accounts.google.com", "accounts.google.com"],
                algorithms: ["RS256"],
              },
              (err) => {
                if (err) reject(err);
                else resolve();
              },
            );
          });

          const email = payload.email;
          const username = email?.split("@")[0] || payload.sub;

          // Get or create user
          const user = await User.getOrCreate({
            username,
            email,
          });

          return {
            userId: user.id,
            email: user.email,
            provider: "google",
            ...payload,
          };
        }
      }
    } catch (jwtError) {
      // If JWT verification fails, try as access token
    }

    // Try as OAuth access token (validate by calling userinfo)
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      throw new Error(
        `Google token validation failed: ${userInfoResponse.statusText}`,
      );
    }

    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;
    const username = email?.split("@")[0] || userInfo.id;

    // Get or create user
    const user = await User.getOrCreate({
      username,
      email,
    });

    return {
      userId: user.id,
      email: user.email,
      provider: "google",
      ...userInfo,
    };
  } catch (error: any) {
    throw new Error(`Google authentication failed: ${error.message}`);
  }
}

/**
 * Validates a GitHub OAuth token by fetching user info
 */
async function validateGitHubToken(token: string): Promise<AuthContext> {
  try {
    // Validate token by calling GitHub API
    const userInfoResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userInfoResponse.ok) {
      throw new Error(
        `GitHub token validation failed: ${userInfoResponse.statusText}`,
      );
    }

    const userInfo = await userInfoResponse.json();

    // Get email from GitHub
    let email = userInfo.email;
    if (!email) {
      const emailsResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (emailsResponse.ok) {
        const emails = await emailsResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }
    }

    if (!email) {
      throw new Error("Email is required but not provided by GitHub");
    }

    const username = userInfo.login || userInfo.id?.toString();

    // Get or create user
    const user = await User.getOrCreate({
      username,
      email,
    });

    return {
      userId: user.id,
      email: user.email,
      provider: "github",
      ...userInfo,
    };
  } catch (error: any) {
    throw new Error(`GitHub authentication failed: ${error.message}`);
  }
}

/**
 * Validates an API key from knowledgeplane-key header
 * Creates or finds a user with that API key stored in their profile
 * Returns auth context with the user if valid
 */
async function validateApiKey(apiKey?: string): Promise<AuthContext | null> {
  if (!apiKey) {
    return null;
  }

  // Check against API_KEYS environment variable if configured (backward compatibility)
  const validKeys =
    process.env.API_KEYS?.split(",")
      .map((k) => k.trim())
      .filter(Boolean) || [];

  // If API_KEYS is configured, validate against it
  // Otherwise, allow any API key and create/find user by it
  if (validKeys.length > 0 && !validKeys.includes(apiKey)) {
    return null;
  }

  // Get or create a user for this API key
  // This ensures API keys can be used with database operations that require a user ID
  // and the same key will always map to the same user
  const user = await User.getOrCreateByApiKey(apiKey);

  // Return auth context for API key authentication
  return {
    userId: user.id,
    email: user.email,
    provider: undefined,
    apiKey: true,
  };
}

/**
 * Validates an OAuth Bearer token and returns the decoded token with user context
 * Supports:
 * - API Key authentication via knowledgeplane-key header
 * - Google OAuth (ID tokens and access tokens)
 * - GitHub OAuth (access tokens)
 * - Generic JWT with JWKS verification
 * - Generic JWT with secret verification (development)
 */
export async function requireAuth(
  header?: string,
  apiKey?: string,
): Promise<AuthContext> {
  // Check API key first (highest priority)
  if (apiKey) {
    const apiKeyAuth = await validateApiKey(apiKey);
    if (apiKeyAuth) {
      return apiKeyAuth;
    }
    // If API key is provided but invalid, throw error
    throw new Error("Unauthorized: Invalid API key");
  }

  if (!header?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length);

  // Try to detect provider from token or use auto-detection
  const providerHint = process.env.OAUTH_PROVIDER?.toLowerCase();

  // Google OAuth
  if (
    providerHint === "google" ||
    (!providerHint && token.startsWith("ya29."))
  ) {
    try {
      return await validateGoogleToken(token);
    } catch (error: any) {
      // Fall through to try other methods
      if (providerHint === "google") {
        throw error;
      }
    }
  }

  // GitHub OAuth (tokens are usually `gho_`, `ghp_`, or `github_pat_`)
  if (
    providerHint === "github" ||
    (!providerHint &&
      (token.startsWith("gho_") ||
        token.startsWith("ghp_") ||
        token.startsWith("github_pat_")))
  ) {
    try {
      return await validateGitHubToken(token);
    } catch (error: any) {
      if (providerHint === "github") {
        throw error;
      }
    }
  }

  // Generic JWT verification with JWKS (for custom OAuth providers)
  if (process.env.JWKS_URI) {
    const jwks = jwksClient({
      jwksUri: process.env.JWKS_URI,
      requestHeaders: {},
      timeout: 30000,
    });

    return new Promise((resolve, reject) => {
      function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
        if (!header.kid) {
          return callback(new Error("No kid in header"));
        }
        jwks.getSigningKey(header.kid, (err, key) => {
          if (err) {
            return callback(err);
          }
          const signingKey = key?.getPublicKey();
          callback(null, signingKey);
        });
      }

      jwt.verify(
        token,
        getKey,
        {
          audience: process.env.OAUTH_AUDIENCE,
          issuer: process.env.OAUTH_ISSUER,
          algorithms: ["RS256"],
        },
        async (err, decoded) => {
          if (err) {
            reject(new Error(`Unauthorized: ${err.message}`));
            return;
          }

          const payload = decoded as any;

          // Try to get or create user from token
          try {
            const email = payload.email;
            if (email) {
              const username =
                email.split("@")[0] ||
                payload.sub ||
                payload.user_id ||
                payload.id;
              const user = await User.getOrCreate({
                username,
                email,
              });

              resolve({
                userId: user.id,
                email: user.email,
                ...payload,
              });
            } else {
              resolve({
                userId: payload.sub || payload.user_id || payload.id,
                email: payload.email,
                ...payload,
              });
            }
          } catch (error: any) {
            // If user creation fails, still return the decoded token
            resolve({
              userId: payload.sub || payload.user_id || payload.id,
              email: payload.email,
              ...payload,
            });
          }
        },
      );
    });
  }

  // Fallback: Simple JWT verification with secret (development only)
  const secret = process.env.JWT_SECRET || process.env.OAUTH_CLIENT_SECRET;
  if (secret) {
    try {
      const decoded = jwt.verify(token, secret, {
        issuer: process.env.OAUTH_ISSUER,
        audience: process.env.OAUTH_AUDIENCE,
      }) as any;

      return {
        userId: decoded.sub || decoded.user_id || decoded.id,
        email: decoded.email,
        ...decoded,
      };
    } catch (error: any) {
      throw new Error(`Unauthorized: ${error.message}`);
    }
  }

  throw new Error(
    "OAuth not configured: Set GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID, JWKS_URI, or JWT_SECRET environment variable",
  );
}
