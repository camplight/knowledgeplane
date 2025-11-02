import { query } from "../lib/db.js";

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface UserInput {
  username: string;
  email: string;
}

export class User {
  static async create(input: UserInput): Promise<UserRecord> {
    const result = await query(
      `INSERT INTO "user"(username, email)
       VALUES($1, $2)
       ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, username, email, created_at`,
      [input.username, input.email],
    );

    return result.rows[0] as UserRecord;
  }

  static async findById(id: string): Promise<UserRecord | null> {
    const result = await query(
      `SELECT id, username, email, created_at FROM "user" WHERE id = $1`,
      [id],
    );

    return result.rows[0] as UserRecord | null;
  }

  static async findByUsername(username: string): Promise<UserRecord | null> {
    const result = await query(
      `SELECT id, username, email, created_at FROM "user" WHERE username = $1`,
      [username],
    );

    return result.rows[0] as UserRecord | null;
  }

  static async getOrCreate(input: UserInput): Promise<UserRecord> {
    const existing = await this.findByUsername(input.username);
    if (existing) {
      // Update email if different
      if (existing.email !== input.email) {
        const result = await query(
          `UPDATE "user" SET email = $1 WHERE username = $2
           RETURNING id, username, email, created_at`,
          [input.email, input.username],
        );
        return result.rows[0] as UserRecord;
      }
      return existing;
    }

    return await this.create(input);
  }
}
