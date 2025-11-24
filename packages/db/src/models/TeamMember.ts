import { collections } from "../db";

export type TeamMemberRole = "owner" | "admin" | "member";

export interface TeamMemberRecord {
  _key?: string;
  _id?: string;
  id: string;
  team_id: string; // Team ID
  user_id: string; // User ID
  role: TeamMemberRole;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberInput {
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
}

export class TeamMember {
  static async create(input: TeamMemberInput): Promise<TeamMemberRecord> {
    // Check if member already exists
    const existing = await this.findByTeamAndUser(
      input.team_id,
      input.user_id,
    );
    if (existing) {
      throw new Error("User is already a member of this team");
    }

    const now = new Date().toISOString();
    const doc = {
      team_id: input.team_id,
      user_id: input.user_id,
      role: input.role,
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await collections.team_members.save(doc, {
        returnNew: true,
      });
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      throw error;
    }
  }

  static async findById(id: string): Promise<TeamMemberRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.team_members.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async findByTeamAndUser(
    teamId: string,
    userId: string,
  ): Promise<TeamMemberRecord | null> {
    const aql = `
      FOR member IN team_members
        FILTER member.team_id == @teamId
        FILTER member.user_id == @userId
        LIMIT 1
        RETURN member
    `;

    const cursor = await collections.team_members.database.query(aql, {
      teamId,
      userId,
    });
    const results = await cursor.all();

    if (!results || results.length === 0) {
      return null;
    }

    return this._normalizeRecord(results[0]);
  }

  static async findByTeam(
    teamId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<TeamMemberRecord[]> {
    const aql = `
      FOR member IN team_members
        FILTER member.team_id == @teamId
        SORT member.created_at ASC
        LIMIT @offset, @limit
        RETURN member
    `;

    const cursor = await collections.team_members.database.query(aql, {
      teamId,
      limit,
      offset,
    });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findByUser(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<TeamMemberRecord[]> {
    const aql = `
      FOR member IN team_members
        FILTER member.user_id == @userId
        SORT member.created_at ASC
        LIMIT @offset, @limit
        RETURN member
    `;

    const cursor = await collections.team_members.database.query(aql, {
      userId,
      limit,
      offset,
    });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async update(
    id: string,
    updates: Partial<Pick<TeamMemberRecord, "role">>,
  ): Promise<TeamMemberRecord> {
    const key = this._extractKey(id);
    const updateDoc: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.role !== undefined) {
      updateDoc.role = updates.role;
    }

    const result = await collections.team_members.update(key, updateDoc, {
      returnNew: true,
    });
    return this._normalizeRecord(result.new!);
  }

  static async delete(id: string): Promise<void> {
    const key = this._extractKey(id);
    try {
      await collections.team_members.remove(key);
    } catch (error: any) {
      if (error.errorNum !== 1202) {
        throw error;
      }
    }
  }

  static async deleteByTeamAndUser(
    teamId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.findByTeamAndUser(teamId, userId);
    if (member) {
      await this.delete(member.id);
    }
  }

  static async countByTeam(teamId: string): Promise<number> {
    const aql = `
      LET count = LENGTH(
        FOR member IN team_members
          FILTER member.team_id == @teamId
          RETURN member
      )
      RETURN count
    `;

    const cursor = await collections.team_members.database.query(aql, {
      teamId,
    });
    const result = await cursor.next();

    return result || 0;
  }

  static async countByUser(userId: string): Promise<number> {
    const aql = `
      LET count = LENGTH(
        FOR member IN team_members
          FILTER member.user_id == @userId
          RETURN member
      )
      RETURN count
    `;

    const cursor = await collections.team_members.database.query(aql, {
      userId,
    });
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

  static _normalizeRecord(doc: any): TeamMemberRecord {
    return {
      id: doc._id || `team_members/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      team_id: doc.team_id,
      user_id: doc.user_id,
      role: doc.role,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

