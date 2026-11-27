import crypto from "crypto";
import jwt from "jsonwebtoken";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
export const KP_TOKEN_ISSUER = "knowledgeplane";
export const KP_TOKEN_AUDIENCE = "knowledgeplane-mcp";

export function tokenSigningKey(): string | null {
  return (
    process.env.TOKEN_SIGNING_KEY ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    null
  );
}

export function issueAccessToken(
  userId: string,
  clientId: string,
): { token: string; expiresIn: number } {
  const key = tokenSigningKey();
  if (!key) {
    throw new Error(
      "TOKEN_SIGNING_KEY is required to issue connector tokens",
    );
  }
  const token = jwt.sign(
    { sub: userId, client_id: clientId, typ: "kp_access" },
    key,
    {
      issuer: KP_TOKEN_ISSUER,
      audience: KP_TOKEN_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    },
  );
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): {
  userId: string;
  clientId: string;
} {
  const key = tokenSigningKey();
  if (!key) {
    throw new Error("TOKEN_SIGNING_KEY is not configured");
  }
  const decoded = jwt.verify(token, key, {
    issuer: KP_TOKEN_ISSUER,
    audience: KP_TOKEN_AUDIENCE,
  }) as jwt.JwtPayload;
  if (decoded.typ !== "kp_access" || !decoded.sub) {
    throw new Error("Not a KnowledgePlane access token");
  }
  return { userId: decoded.sub, clientId: String(decoded.client_id || "") };
}

export function newRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildClientAssertion(options: {
  clientId: string;
  tokenUrl: string;
  privateKeyPem: string;
  now?: number;
}): string {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: options.clientId,
      sub: options.clientId,
      aud: options.tokenUrl,
      jti: crypto.randomBytes(16).toString("hex"),
      iat: now,
      exp: now + 300,
    },
    options.privateKeyPem,
    { algorithm: "RS256" },
  );
}
