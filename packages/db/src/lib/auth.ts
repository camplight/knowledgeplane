import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { JwksClient } from "jwks-rsa";
import { User } from "../models/User";
import { Workspace } from "../models/Workspace";

export interface AuthContext {
  userId: string;
  email?: string;
  provider?: "google" | "github";
  workspaceId?: string;
  apiKeyScope?: "legacy" | "workspace" | "user";
  [key: string]: any;
}

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

async function validateGoogleToken(token: string): Promise<AuthContext> {
  try {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (decoded && typeof decoded === "object" && decoded.payload) {
        const payload = decoded.payload as any;

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
          const user = await User.getOrCreate({ username, email });

          return {
            userId: user.id,
            email: user.email,
            provider: "google",
            ...payload,
          };
        }
      }
    } catch (jwtError) {
      // fall through
    }

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
    const user = await User.getOrCreate({ username, email });

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

async function validateGitHubToken(token: string): Promise<AuthContext> {
  try {
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
    const user = await User.getOrCreate({ username, email });

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

async function validateApiKey(apiKey?: string): Promise<AuthContext | null> {
  if (!apiKey) {
    return null;
  }

  const validKeys =
    process.env.API_KEYS?.split(",")
      .map((k) => k.trim())
      .filter(Boolean) || [];

  if (validKeys.length > 0 && validKeys.includes(apiKey)) {
    const user = await User.getOrCreateByApiKey(apiKey);
    return {
      userId: user.id,
      email: user.email,
      provider: undefined,
      apiKey: true,
      apiKeyScope: "legacy",
    };
  }

  const workspace = await Workspace.findByRestApiKey(apiKey);
  if (workspace) {
    const userId = workspace.rest_api_key_created_by || workspace.created_by;
    const user = await User.findById(userId);
    return {
      userId,
      email: user?.email,
      provider: undefined,
      apiKey: true,
      apiKeyScope: "workspace",
      workspaceId: workspace.id,
    };
  }

  const existingUser = await User.findByApiKey(apiKey);
  if (existingUser) {
    return {
      userId: existingUser.id,
      email: existingUser.email,
      provider: undefined,
      apiKey: true,
      apiKeyScope: "user",
    };
  }

  return null;
}

export async function requireAuth(
  header?: string,
  apiKey?: string,
): Promise<AuthContext> {
  if (apiKey) {
    const apiKeyAuth = await validateApiKey(apiKey);
    if (apiKeyAuth) {
      return apiKeyAuth;
    }
    throw new Error("Unauthorized: Invalid API key");
  }

  if (!header?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length);
  const providerHint = process.env.OAUTH_PROVIDER?.toLowerCase();

  if (
    providerHint === "google" ||
    (!providerHint && token.startsWith("ya29."))
  ) {
    try {
      return await validateGoogleToken(token);
    } catch (error: any) {
      if (providerHint === "google") {
        throw error;
      }
    }
  }

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
          try {
            const email = payload.email;
            if (email) {
              const username =
                email.split("@")[0] ||
                payload.sub ||
                payload.user_id ||
                payload.id;
              const user = await User.getOrCreate({ username, email });

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

