import { collections } from "../db";

export interface TeamRecord {
  _key?: string;
  _id?: string;
  id: string;
  name: string;
  slug: string; // URL-friendly team identifier
  description?: string;
  created_by: string; // User ID of the creator
  created_at: string;
  updated_at: string;
}

export interface TeamInput {
  name: string;
  description?: string;
  created_by: string; // User ID of the creator
}

export class Team {
  static async create(input: TeamInput): Promise<TeamRecord> {
    // Generate slug from name
    const slug = this._generateSlug(input.name);

    // Check if slug already exists
    const existing = await this.findBySlug(slug);
    if (existing) {
      // Append random suffix if slug exists
      const uniqueSlug = `${slug}-${Math.random().toString(36).substring(2, 8)}`;
      return this._createWithSlug(input, uniqueSlug);
    }

    return this._createWithSlug(input, slug);
  }

  private static async _createWithSlug(
    input: TeamInput,
    slug: string,
  ): Promise<TeamRecord> {
    const now = new Date().toISOString();
    const doc = {
      name: input.name,
      slug,
      description: input.description || null,
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await collections.teams.save(doc, { returnNew: true });
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      throw error;
    }
  }

  static async findById(id: string): Promise<TeamRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.teams.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async findBySlug(slug: string): Promise<TeamRecord | null> {
    const aql = `
      FOR team IN teams
        FILTER team.slug == @slug
        LIMIT 1
        RETURN team
    `;

    const cursor = await collections.teams.database.query(aql, { slug });
    const results = await cursor.all();

    if (!results || results.length === 0) {
      return null;
    }

    return this._normalizeRecord(results[0]);
  }

  static async list(
    limit: number = 50,
    offset: number = 0,
  ): Promise<TeamRecord[]> {
    const aql = `
      FOR team IN teams
        SORT team.created_at DESC
        LIMIT @offset, @limit
        RETURN team
    `;

    const cursor = await collections.teams.database.query(aql, {
      limit,
      offset,
    });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findByUserId(userId: string): Promise<TeamRecord[]> {
    const aql = `
      FOR member IN team_members
        FILTER member.user_id == @userId
        LET team = DOCUMENT(member.team_id)
        RETURN team
    `;

    const cursor = await collections.team_members.database.query(aql, {
      userId,
    });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async update(
    id: string,
    updates: Partial<Pick<TeamRecord, "name" | "description">>,
  ): Promise<TeamRecord> {
    const key = this._extractKey(id);
    const updateDoc: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) {
      updateDoc.name = updates.name;
      // Regenerate slug if name changes
      updateDoc.slug = this._generateSlug(updates.name);
    }
    if (updates.description !== undefined) {
      updateDoc.description = updates.description;
    }

    const result = await collections.teams.update(key, updateDoc, {
      returnNew: true,
    });
    return this._normalizeRecord(result.new!);
  }

  static async delete(id: string): Promise<void> {
    const key = this._extractKey(id);
    try {
      await collections.teams.remove(key);
    } catch (error: any) {
      if (error.errorNum !== 1202) {
        throw error;
      }
    }
  }

  static async count(): Promise<number> {
    const aql = `
      LET count = LENGTH(FOR team IN teams RETURN team)
      RETURN count
    `;

    const cursor = await collections.teams.database.query(aql);
    const result = await cursor.next();

    return result || 0;
  }

  // Helper methods
  static _extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-"); // Replace multiple hyphens with single hyphen
  }

  static _normalizeRecord(doc: any): TeamRecord {
    return {
      id: doc._id || `teams/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      created_by: doc.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

