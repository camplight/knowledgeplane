import { collections } from "../db";

export interface AuthorizationRequestRecord {
  _key?: string;
  _id?: string;
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
  _key?: string;
  _id?: string;
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
  static async create(
    input: AuthorizationRequestInput,
  ): Promise<AuthorizationRequestRecord> {
    const now = new Date();
    const doc = {
      key: input.key,
      client_id: input.client_id,
      redirect_uri: input.redirect_uri,
      state: input.state,
      code_challenge: input.code_challenge,
      code_challenge_method: input.code_challenge_method,
      scope: input.scope || null,
      expires_at: new Date(input.expires_at),
      created_at: now,
    };

    const collection = collections.oauth_authorization_requests || collections.facts.database.collection("oauth_authorization_requests");
    const result = await collection.save(doc, {
      returnNew: true,
    });
    return this._normalizeRequestRecord(result.new!);
  }

  static async findByKey(
    key: string,
  ): Promise<AuthorizationRequestRecord | null> {
    const collection = collections.oauth_authorization_requests || collections.facts.database.collection("oauth_authorization_requests");
    const aql = `
      FOR req IN oauth_authorization_requests
        FILTER req.key == @key
        FILTER req.expires_at > DATE_NOW()
        LIMIT 1
        RETURN req
    `;

    const cursor = await collection.database.query(
      aql,
      { key },
    );
    const results = await cursor.all();

    if (results.length === 0) {
      return null;
    }

    return this._normalizeRequestRecord(results[0]);
  }

  static async delete(key: string): Promise<void> {
    const collection = collections.oauth_authorization_requests || collections.facts.database.collection("oauth_authorization_requests");
    const aql = `
      FOR req IN oauth_authorization_requests
        FILTER req.key == @key
        REMOVE req IN oauth_authorization_requests
    `;

    await collection.database.query(aql, {
      key,
    });
  }

  static async cleanupExpired(): Promise<number> {
    const collection = collections.oauth_authorization_requests || collections.facts.database.collection("oauth_authorization_requests");
    const aql = `
      FOR req IN oauth_authorization_requests
        FILTER req.expires_at <= DATE_NOW()
        REMOVE req IN oauth_authorization_requests
    `;

    const cursor = await collection.database.query(aql);
    const results = await cursor.all();
    return results.length;
  }

  static _normalizeRequestRecord(doc: any): AuthorizationRequestRecord {
    return {
      _key: doc._key,
      _id: doc._id,
      key: doc.key,
      client_id: doc.client_id,
      redirect_uri: doc.redirect_uri,
      state: doc.state,
      code_challenge: doc.code_challenge,
      code_challenge_method: doc.code_challenge_method,
      scope: doc.scope,
      expires_at: new Date(doc.expires_at),
      created_at: new Date(doc.created_at),
    };
  }
}

export class OAuthAuthorizationCode {
  static async create(
    input: AuthorizationCodeInput,
  ): Promise<AuthorizationCodeRecord> {
    const now = new Date();
    const doc = {
      code: input.code,
      client_id: input.client_id,
      redirect_uri: input.redirect_uri,
      code_challenge: input.code_challenge,
      code_challenge_method: input.code_challenge_method,
      user_id: input.user_id,
      scope: input.scope || null,
      oauth_access_token: input.oauth_access_token,
      provider: input.provider,
      expires_at: new Date(input.expires_at),
      created_at: now,
    };

    const collection = collections.oauth_authorization_codes || collections.facts.database.collection("oauth_authorization_codes");
    const result = await collection.save(doc, {
      returnNew: true,
    });
    return this._normalizeCodeRecord(result.new!);
  }

  static async findByCode(
    code: string,
  ): Promise<AuthorizationCodeRecord | null> {
    const collection = collections.oauth_authorization_codes || collections.facts.database.collection("oauth_authorization_codes");
    const aql = `
      FOR code IN oauth_authorization_codes
        FILTER code.code == @code
        FILTER code.expires_at > DATE_NOW()
        LIMIT 1
        RETURN code
    `;

    const cursor = await collection.database.query(
      aql,
      { code },
    );
    const results = await cursor.all();

    if (results.length === 0) {
      return null;
    }

    return this._normalizeCodeRecord(results[0]);
  }

  static async delete(code: string): Promise<void> {
    const collection = collections.oauth_authorization_codes || collections.facts.database.collection("oauth_authorization_codes");
    const aql = `
      FOR code IN oauth_authorization_codes
        FILTER code.code == @code
        REMOVE code IN oauth_authorization_codes
    `;

    await collection.database.query(aql, { code });
  }

  static async cleanupExpired(): Promise<number> {
    const collection = collections.oauth_authorization_codes || collections.facts.database.collection("oauth_authorization_codes");
    const aql = `
      FOR code IN oauth_authorization_codes
        FILTER code.expires_at <= DATE_NOW()
        REMOVE code IN oauth_authorization_codes
    `;

    const cursor = await collection.database.query(aql);
    const results = await cursor.all();
    return results.length;
  }

  static _normalizeCodeRecord(doc: any): AuthorizationCodeRecord {
    return {
      _key: doc._key,
      _id: doc._id,
      code: doc.code,
      client_id: doc.client_id,
      redirect_uri: doc.redirect_uri,
      code_challenge: doc.code_challenge,
      code_challenge_method: doc.code_challenge_method,
      user_id: doc.user_id,
      scope: doc.scope,
      oauth_access_token: doc.oauth_access_token,
      provider: doc.provider,
      expires_at: new Date(doc.expires_at),
      created_at: new Date(doc.created_at),
    };
  }
}
