import { collections } from "../db";

export interface UserRecord {
  _key?: string;
  _id?: string;
  id: string;
  username: string;
  email: string;
  api_key?: string;
  created_at: string;
}

export interface UserInput {
  username: string;
  email: string;
}

export class User {
  static async create(input: UserInput, apiKey?: string): Promise<UserRecord> {
    const doc = {
      username: input.username,
      email: input.email,
      api_key: apiKey || null,
      created_at: new Date().toISOString(),
    };

    try {
      const result = await collections.users.save(doc, { returnNew: true });
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      if (error.errorNum === 1210) {
        // Unique constraint violation - try to update
        const existing = await this.findByUsername(input.username);
        if (existing) {
          const key = this._extractKey(existing.id);
          const result = await collections.users.update(
            key,
            {
              email: input.email,
              api_key: apiKey || existing.api_key,
            },
            { returnNew: true },
          );
          return this._normalizeRecord(result.new!);
        }
      }
      throw error;
    }
  }

  static async findById(id: string): Promise<UserRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.users.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        // Document not found
        return null;
      }
      throw error;
    }
  }

  static async findByUsername(username: string): Promise<UserRecord | null> {
    const aql = `
      FOR user IN users
        FILTER user.username == @username
        LIMIT 1
        RETURN user
    `;

    const cursor = await collections.users.database.query(aql, { username });
    const results = await cursor.all();

    if (!results || results.length === 0) {
      return null;
    }

    return this._normalizeRecord(results[0]);
  }

  static async findByApiKey(apiKey: string): Promise<UserRecord | null> {
    const aql = `
      FOR user IN users
        FILTER user.api_key == @apiKey
        LIMIT 1
        RETURN user
    `;

    const cursor = await collections.users.database.query(aql, { apiKey });
    const results = await cursor.all();

    if (!results || results.length === 0) {
      return null;
    }

    return this._normalizeRecord(results[0]);
  }

  static async getOrCreate(
    input: UserInput,
    apiKey?: string,
  ): Promise<UserRecord> {
    const existing = await this.findByUsername(input.username);
    if (existing) {
      if (
        existing.email !== input.email ||
        (apiKey && existing.api_key !== apiKey)
      ) {
        const key = this._extractKey(existing.id);
        const result = await collections.users.update(
          key,
          {
            email: input.email,
            api_key: apiKey || existing.api_key,
          },
          { returnNew: true },
        );
        return this._normalizeRecord(result.new!);
      }
      return existing;
    }

    return await this.create(input, apiKey);
  }

  static async getOrCreateByApiKey(apiKey: string): Promise<UserRecord> {
    const existing = await this.findByApiKey(apiKey);
    if (existing) {
      return existing;
    }

    const keyPrefix = apiKey.substring(0, 8);
    const username = `api-key-${keyPrefix}`;
    const email = `${username}@knowledgeplane.local`;

    return await this.create({ username, email }, apiKey);
  }

  static async list(
    limit: number = 50,
    offset: number = 0,
  ): Promise<UserRecord[]> {
    const aql = `
      FOR user IN users
        SORT user.created_at DESC
        LIMIT @offset, @limit
        RETURN user
    `;

    const cursor = await collections.users.database.query(aql, {
      limit,
      offset,
    });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async count(): Promise<number> {
    const aql = `
      LET count = LENGTH(FOR user IN users RETURN user)
      RETURN count
    `;

    const cursor = await collections.users.database.query(aql);
    const result = await cursor.next();

    return result || 0;
  }

  // Helper methods
  static _extractKey(id: string): string {
    // Handle both _key format and _id format
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): UserRecord {
    return {
      id: doc._id || `users/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      username: doc.username,
      email: doc.email,
      api_key: doc.api_key,
      created_at: doc.created_at,
    };
  }
}
