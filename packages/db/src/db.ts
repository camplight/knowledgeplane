import pg from "pg";
import "dotenv/config";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const query = (text: string, params?: any[]) => pool.query(text, params);

export async function init() {
  await query(`CREATE EXTENSION IF NOT EXISTS vector;`);
}

