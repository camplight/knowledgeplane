import { collections } from "../db";

export type WorkspaceMemberRole = "owner" | "admin" | "member";

export interface WorkspaceMemberRecord {
  _key?: string;
  _id?: string;
  id: string;
  workspace_id: string; // Workspace ID
  user_id: string; // User ID
  role: WorkspaceMemberRole;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMemberInput {
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
}

export class WorkspaceMember {
  static async create(input: WorkspaceMemberInput): Promise<WorkspaceMemberRecord> {
    // Check if member already exists
    const existing = await this.findByWorkspaceAndUser(
      input.workspace_id,
      input.user_id,
    );
    if (existing) {
      throw new Error("User is already a member of this workspace");
    }

    const now = new Date().toISOString();
    const doc = {
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      role: input.role,
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await collections.workspace_members.save(doc, {
        returnNew: true,
      });
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      throw error;
    }
  }

  static async findById(id: string): Promise<WorkspaceMemberRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.workspace_members.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async findByWorkspaceAndUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberRecord | null> {
    const aql = `
      FOR member IN workspace_members
        FILTER member.workspace_id == @workspaceId
        FILTER member.user_id == @userId
        LIMIT 1
        RETURN member
    `;

    const cursor = await collections.workspace_members.database.query(aql, {
      workspaceId,
      userId,
    });
    const results = await cursor.all();

    if (!results || results.length === 0) {
      return null;
    }

    return this._normalizeRecord(results[0]);
  }

  static async findByWorkspace(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<WorkspaceMemberRecord[]> {
    const aql = `
      FOR member IN workspace_members
        FILTER member.workspace_id == @workspaceId
        SORT member.created_at ASC
        LIMIT @offset, @limit
        RETURN member
    `;

    const cursor = await collections.workspace_members.database.query(aql, {
      workspaceId,
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
  ): Promise<WorkspaceMemberRecord[]> {
    const aql = `
      FOR member IN workspace_members
        FILTER member.user_id == @userId
        SORT member.created_at ASC
        LIMIT @offset, @limit
        RETURN member
    `;

    const cursor = await collections.workspace_members.database.query(aql, {
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
    updates: Partial<Pick<WorkspaceMemberRecord, "role">>,
  ): Promise<WorkspaceMemberRecord> {
    const key = this._extractKey(id);
    const updateDoc: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.role !== undefined) {
      updateDoc.role = updates.role;
    }

    const result = await collections.workspace_members.update(key, updateDoc, {
      returnNew: true,
    });
    return this._normalizeRecord(result.new!);
  }

  static async delete(id: string): Promise<void> {
    const key = this._extractKey(id);
    try {
      await collections.workspace_members.remove(key);
    } catch (error: any) {
      if (error.errorNum !== 1202) {
        throw error;
      }
    }
  }

  static async deleteByWorkspaceAndUser(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.findByWorkspaceAndUser(workspaceId, userId);
    if (member) {
      await this.delete(member.id);
    }
  }

  static async countByWorkspace(workspaceId: string): Promise<number> {
    const aql = `
      LET count = LENGTH(
        FOR member IN workspace_members
          FILTER member.workspace_id == @workspaceId
          RETURN member
      )
      RETURN count
    `;

    const cursor = await collections.workspace_members.database.query(aql, {
      workspaceId,
    });
    const result = await cursor.next();

    return result || 0;
  }

  static async countByUser(userId: string): Promise<number> {
    const aql = `
      LET count = LENGTH(
        FOR member IN workspace_members
          FILTER member.user_id == @userId
          RETURN member
      )
      RETURN count
    `;

    const cursor = await collections.workspace_members.database.query(aql, {
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

  static _normalizeRecord(doc: any): WorkspaceMemberRecord {
    return {
      id: doc._id || `workspace_members/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      workspace_id: doc.workspace_id,
      user_id: doc.user_id,
      role: doc.role,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

