import { collections } from "../db";
import {
  decideRefresh,
  type RefreshRecord,
} from "../lib/write-policy";

export interface ConnectorRefreshTokenRecord {
  id: string;
  user_id: string;
  client_id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked: boolean;
  created_at: string;
}

export class ConnectorRefreshToken {
  static async create(input: {
    userId: string;
    clientId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    await collections.connector_refresh_tokens.save({
      user_id: input.userId,
      client_id: input.clientId,
      family_id: input.familyId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      used_at: null,
      revoked: false,
      created_at: new Date().toISOString(),
    });
  }

  static async findByHash(
    tokenHash: string,
  ): Promise<ConnectorRefreshTokenRecord | null> {
    const cursor = await collections.connector_refresh_tokens.database.query(
      `
      FOR token IN connector_refresh_tokens
        FILTER token.token_hash == @tokenHash
        LIMIT 1
        RETURN token
      `,
      { tokenHash },
    );
    const doc = await cursor.next();
    if (!doc) {
      return null;
    }
    return this._normalize(doc);
  }

  static async markUsed(id: string): Promise<void> {
    const key = id.includes("/") ? id.split("/")[1] : id;
    await collections.connector_refresh_tokens.update(key, {
      used_at: new Date().toISOString(),
    });
  }

  static async revokeFamily(familyId: string): Promise<void> {
    await collections.connector_refresh_tokens.database.query(
      `
      FOR token IN connector_refresh_tokens
        FILTER token.family_id == @familyId
        UPDATE token WITH { revoked: true } IN connector_refresh_tokens
      `,
      { familyId },
    );
  }

  static async revokeUser(userId: string): Promise<void> {
    await collections.connector_refresh_tokens.database.query(
      `
      FOR token IN connector_refresh_tokens
        FILTER token.user_id == @userId
        UPDATE token WITH { revoked: true } IN connector_refresh_tokens
      `,
      { userId },
    );
  }

  static toRefreshRecord(record: ConnectorRefreshTokenRecord): RefreshRecord {
    return {
      familyId: record.family_id,
      usedAt: record.used_at ? Date.parse(record.used_at) : null,
      expiresAt: Date.parse(record.expires_at),
      revoked: record.revoked,
    };
  }

  static decide(record: ConnectorRefreshTokenRecord | null, now = Date.now()) {
    return decideRefresh(record ? this.toRefreshRecord(record) : null, now);
  }

  static _normalize(doc: any): ConnectorRefreshTokenRecord {
    return {
      id: doc._id || `connector_refresh_tokens/${doc._key}`,
      user_id: doc.user_id,
      client_id: doc.client_id,
      family_id: doc.family_id,
      token_hash: doc.token_hash,
      expires_at: doc.expires_at,
      used_at: doc.used_at || null,
      revoked: doc.revoked === true,
      created_at: doc.created_at,
    };
  }
}
