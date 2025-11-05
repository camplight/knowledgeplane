import { query } from "../db.js";

export interface AuthorizationRequestRecord {
  key: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string | null;
  expires_at: Date;
  created_at: Date;
}

export interface AuthorizationCodeRecord {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  user_id: string;
  scope: string | null;
  oauth_access_token: string;
  provider: "google" | "github";
  expires_at: Date;
  created_at: Date;
}

export interface AuthorizationRequestInput {
  key: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  expires_at: number; // milliseconds since epoch
}

export interface AuthorizationCodeInput {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  user_id: string;
  scope?: string;
  oauth_access_token: string;
  provider: "google" | "github";
  expires_at: number; // milliseconds since epoch
}

export class OAuthAuthorizationRequest {
  static async create(input: AuthorizationRequestInput): Promise<AuthorizationRequestRecord> {
    const result = await query(
      `INSERT INTO oauth_authorization_request(key, client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, expires_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
       RETURNING key, client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, expires_at, created_at`,
      [
        input.key,
        input.client_id,
        input.redirect_uri,
        input.state,
        input.code_challenge,
        input.code_challenge_method,
        input.scope || null,
        input.expires_at,
      ],
    );

    const row = result.rows[0];
    return {
      key: row.key,
      client_id: row.client_id,
      redirect_uri: row.redirect_uri,
      state: row.state,
      code_challenge: row.code_challenge,
      code_challenge_method: row.code_challenge_method,
      scope: row.scope,
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
    };
  }

  static async findByKey(key: string): Promise<AuthorizationRequestRecord | null> {
    const result = await query(
      `SELECT key, client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, expires_at, created_at
       FROM oauth_authorization_request
       WHERE key = $1 AND expires_at > NOW()`,
      [key],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      key: row.key,
      client_id: row.client_id,
      redirect_uri: row.redirect_uri,
      state: row.state,
      code_challenge: row.code_challenge,
      code_challenge_method: row.code_challenge_method,
      scope: row.scope,
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
    };
  }

  static async delete(key: string): Promise<void> {
    await query(
      `DELETE FROM oauth_authorization_request WHERE key = $1`,
      [key],
    );
  }

  static async cleanupExpired(): Promise<number> {
    const result = await query(
      `DELETE FROM oauth_authorization_request WHERE expires_at <= NOW()`,
    );
    return result.rowCount || 0;
  }
}

export class OAuthAuthorizationCode {
  static async create(input: AuthorizationCodeInput): Promise<AuthorizationCodeRecord> {
    const result = await query(
      `INSERT INTO oauth_authorization_code(code, client_id, redirect_uri, code_challenge, code_challenge_method, user_id, scope, oauth_access_token, provider, expires_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))
       RETURNING code, client_id, redirect_uri, code_challenge, code_challenge_method, user_id, scope, oauth_access_token, provider, expires_at, created_at`,
      [
        input.code,
        input.client_id,
        input.redirect_uri,
        input.code_challenge,
        input.code_challenge_method,
        input.user_id,
        input.scope || null,
        input.oauth_access_token,
        input.provider,
        input.expires_at,
      ],
    );

    const row = result.rows[0];
    return {
      code: row.code,
      client_id: row.client_id,
      redirect_uri: row.redirect_uri,
      code_challenge: row.code_challenge,
      code_challenge_method: row.code_challenge_method,
      user_id: row.user_id,
      scope: row.scope,
      oauth_access_token: row.oauth_access_token,
      provider: row.provider,
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
    };
  }

  static async findByCode(code: string): Promise<AuthorizationCodeRecord | null> {
    const result = await query(
      `SELECT code, client_id, redirect_uri, code_challenge, code_challenge_method, user_id, scope, oauth_access_token, provider, expires_at, created_at
       FROM oauth_authorization_code
       WHERE code = $1 AND expires_at > NOW()`,
      [code],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      code: row.code,
      client_id: row.client_id,
      redirect_uri: row.redirect_uri,
      code_challenge: row.code_challenge,
      code_challenge_method: row.code_challenge_method,
      user_id: row.user_id,
      scope: row.scope,
      oauth_access_token: row.oauth_access_token,
      provider: row.provider,
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
    };
  }

  static async delete(code: string): Promise<void> {
    await query(
      `DELETE FROM oauth_authorization_code WHERE code = $1`,
      [code],
    );
  }

  static async cleanupExpired(): Promise<number> {
    const result = await query(
      `DELETE FROM oauth_authorization_code WHERE expires_at <= NOW()`,
    );
    return result.rowCount || 0;
  }
}

