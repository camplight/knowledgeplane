import { query } from "../db.js";

export interface UserRecord {
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
    const result = await query(
      `INSERT INTO "user"(username, email, api_key)
       VALUES($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, api_key = COALESCE(EXCLUDED.api_key, "user".api_key)
       RETURNING id, username, email, api_key, created_at`,
      [input.username, input.email, apiKey || null],
    );

    return result.rows[0] as UserRecord;
  }

  static async findById(id: string): Promise<UserRecord | null> {
    const result = await query(
      `SELECT id, username, email, api_key, created_at FROM "user" WHERE id = $1`,
      [id],
    );

    return result.rows[0] as UserRecord | null;
  }

  static async findByUsername(username: string): Promise<UserRecord | null> {
    const result = await query(
      `SELECT id, username, email, api_key, created_at FROM "user" WHERE username = $1`,
      [username],
    );

    return result.rows[0] as UserRecord | null;
  }

  static async findByApiKey(apiKey: string): Promise<UserRecord | null> {
    const result = await query(
      `SELECT id, username, email, api_key, created_at FROM "user" WHERE api_key = $1`,
      [apiKey],
    );

    return result.rows[0] as UserRecord | null;
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
        const result = await query(
          `UPDATE "user" SET email = $1, api_key = COALESCE($3, api_key) WHERE username = $2
           RETURNING id, username, email, api_key, created_at`,
          [input.email, input.username, apiKey || null],
        );
        return result.rows[0] as UserRecord;
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
    const result = await query(
      `SELECT id, username, email, api_key, created_at
       FROM "user"
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return result.rows as UserRecord[];
  }

  static async count(): Promise<number> {
    const result = await query(`SELECT COUNT(*) as count FROM "user"`);
    return parseInt(result.rows[0].count, 10);
  }
}

