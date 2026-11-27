import crypto from "crypto";
import {
  ConnectorRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  hashRefreshToken,
  issueAccessToken,
  newRefreshToken,
} from "@knowledgeplane/db";

export interface ConnectorGrant {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

export async function issueConnectorGrant(
  userId: string,
  clientId: string,
  familyId?: string,
): Promise<ConnectorGrant> {
  const family = familyId || crypto.randomUUID();
  const refresh = newRefreshToken();
  const access = issueAccessToken(userId, clientId);
  await ConnectorRefreshToken.create({
    userId,
    clientId,
    familyId: family,
    tokenHash: refresh.hash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: access.expiresIn,
    refresh_token: refresh.token,
  };
}

export async function rotateConnectorGrant(
  presented: string,
  clientId?: string,
): Promise<ConnectorGrant> {
  const record = await ConnectorRefreshToken.findByHash(hashRefreshToken(presented));
  const decision = ConnectorRefreshToken.decide(record);
  if (decision.action === "reject") {
    throw new Error("Refresh token is not valid");
  }
  if (decision.action === "revoke_family") {
    if (decision.familyId) {
      await ConnectorRefreshToken.revokeFamily(decision.familyId);
    }
    throw new Error(
      decision.reason === "reuse"
        ? "Refresh token reuse detected; the token family was revoked"
        : "Refresh token is no longer valid",
    );
  }
  if (!record) {
    throw new Error("Refresh token is not valid");
  }
  await ConnectorRefreshToken.markUsed(record.id);
  return issueConnectorGrant(
    record.user_id,
    clientId || record.client_id,
    record.family_id,
  );
}
