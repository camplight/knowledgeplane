import { query } from "../lib/db.js";

export interface FactInput {
  content: string;
  metadata?: Record<string, string>;
  created_by: string; // User ID
  last_updated_by: string; // User ID
  knowledge_context?: string;
}

export interface FactRecord {
  id: string;
  content: string;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
  created_by: string;
  last_updated_by: string;
  knowledge_context: string;
  trashed: boolean;
}

export interface FactSearchResult extends FactRecord {
  score: number;
}

export interface FactSearchParams {
  query: string;
  knowledge_context?: string;
  k?: number;
  offset?: number;
  include_trashed?: boolean;
}

export class Fact {
  static async write(input: FactInput): Promise<FactRecord> {
    const result = await query(
      `INSERT INTO fact(content, metadata, created_by, last_updated_by, knowledge_context)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, content, metadata, created_at, updated_at, created_by, last_updated_by, knowledge_context, trashed`,
      [
        input.content,
        input.metadata || {},
        input.created_by,
        input.last_updated_by,
        input.knowledge_context || "",
      ],
    );

    return result.rows[0] as FactRecord;
  }

  static async trash(id: string, last_updated_by: string): Promise<FactRecord> {
    const result = await query(
      `UPDATE fact
       SET trashed = true, last_updated_by = $2
       WHERE id = $1
       RETURNING id, content, metadata, created_at, updated_at, created_by, last_updated_by, knowledge_context, trashed`,
      [id, last_updated_by],
    );

    if (result.rows.length === 0) {
      throw new Error(`Fact with id ${id} not found`);
    }

    return result.rows[0] as FactRecord;
  }

  static async search(params: FactSearchParams): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;

    // Handle wildcard '*' to search for all facts
    const isWildcard = params.query === "*";

    let sql: string;
    let queryParams: any[];

    if (isWildcard) {
      sql = `SELECT id, content, metadata, created_at, updated_at, created_by, last_updated_by, knowledge_context, trashed,
                   1.0 AS score
             FROM fact
             WHERE ($1::text IS NULL OR knowledge_context = $1)
               AND (trashed = false OR $4::boolean = true)
             ORDER BY updated_at DESC, created_at DESC
             LIMIT $2 OFFSET $3;`;
      queryParams = [params.knowledge_context || null, limit, offset, includeTrashed];
    } else {
      const searchPattern = `%${params.query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      sql = `SELECT id, content, metadata, created_at, updated_at, created_by, last_updated_by, knowledge_context, trashed,
                   1.0 AS score
             FROM fact
             WHERE ($1::text IS NULL OR knowledge_context = $1)
               AND content ILIKE $4
               AND (trashed = false OR $5::boolean = true)
             ORDER BY updated_at DESC, created_at DESC
             LIMIT $2 OFFSET $3;`;
      queryParams = [
        params.knowledge_context || null,
        limit,
        offset,
        searchPattern,
        includeTrashed,
      ];
    }

    const result = await query(sql, queryParams);

    return result.rows.map((row) => ({
      ...row,
      score: parseFloat(row.score) || 0,
    })) as FactSearchResult[];
  }
}
