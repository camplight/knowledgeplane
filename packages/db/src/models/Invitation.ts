import { collections } from "../db";
import crypto from "crypto";

export interface InvitationRecord {
  _key?: string;
  _id?: string;
  id: string;
  team_id: string; // Team ID
  invited_by: string; // User ID
  token: string; // Unique invitation token (personal invitation link)
  status: "pending" | "accepted" | "expired";
  expires_at: string; // ISO 8601 timestamp
  accepted_at?: string; // ISO 8601 timestamp
  accepted_by?: string; // User ID who accepted the invitation
  created_at: string; // ISO 8601 timestamp
}

export interface InvitationInput {
  team_id: string; // Team ID
  invited_by: string; // User ID
  expires_in_days?: number; // Default 7 days
}

export class Invitation {
  static async create(input: InvitationInput): Promise<InvitationRecord> {
    const expiresInDays = input.expires_in_days || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const token = `inv_${crypto.randomBytes(32).toString("base64url")}`;

    const doc = {
      team_id: input.team_id,
      invited_by: input.invited_by,
      token,
      status: "pending" as const,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    };

    try {
      const result = await collections.invitations.save(doc, { returnNew: true });
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      throw error;
    }
  }

  static async findById(id: string): Promise<InvitationRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.invitations.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        // Document not found
        return null;
      }
      throw error;
    }
  }

  static async findByToken(token: string): Promise<InvitationRecord | null> {
    const aql = `
      FOR inv IN invitations
        FILTER inv.token == @token
        LIMIT 1
        RETURN inv
    `;

    const cursor = await collections.invitations.database.query(aql, { token });
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
  ): Promise<InvitationRecord[]> {
    const aql = `
      FOR inv IN invitations
        FILTER inv.team_id == @teamId
        SORT inv.created_at DESC
        LIMIT @offset, @limit
        RETURN inv
    `;

    const cursor = await collections.invitations.database.query(aql, {
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

  static async list(
    teamId?: string,
    limit: number = 50,
    offset: number = 0,
    status?: "pending" | "accepted" | "expired",
  ): Promise<InvitationRecord[]> {
    let aql = `
      FOR inv IN invitations
    `;

    const filters: string[] = [];
    const bindVars: any = { limit, offset };

    if (teamId) {
      filters.push(`inv.team_id == @teamId`);
      bindVars.teamId = teamId;
    }
    if (status) {
      filters.push(`inv.status == @status`);
      bindVars.status = status;
    }

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += `
        SORT inv.created_at DESC
        LIMIT @offset, @limit
        RETURN inv
    `;

    const cursor = await collections.invitations.database.query(aql, bindVars);
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async count(
    teamId?: string,
    status?: "pending" | "accepted" | "expired",
  ): Promise<number> {
    let aql = `
      LET count = LENGTH(
        FOR inv IN invitations
    `;

    const filters: string[] = [];
    const bindVars: any = {};

    if (teamId) {
      filters.push(`inv.team_id == @teamId`);
      bindVars.teamId = teamId;
    }
    if (status) {
      filters.push(`inv.status == @status`);
      bindVars.status = status;
    }

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += `
          RETURN inv
      )
      RETURN count
    `;

    const cursor = await collections.invitations.database.query(aql, bindVars);
    const result = await cursor.next();

    return result || 0;
  }

  static async accept(token: string, userId: string): Promise<InvitationRecord> {
    const invitation = await this.findByToken(token);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error(`Invitation is already ${invitation.status}`);
    }

    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      // Mark as expired
      const key = this._extractKey(invitation.id);
      await collections.invitations.update(key, {
        status: "expired",
      });
      throw new Error("Invitation has expired");
    }

    const key = this._extractKey(invitation.id);
    const result = await collections.invitations.update(
      key,
      {
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
      },
      { returnNew: true },
    );
    return this._normalizeRecord(result.new!);
  }

  static async updateStatus(
    id: string,
    status: "pending" | "accepted" | "expired",
  ): Promise<InvitationRecord> {
    const key = this._extractKey(id);
    const updates: any = { status };
    if (status === "accepted") {
      updates.accepted_at = new Date().toISOString();
    }
    const result = await collections.invitations.update(key, updates, {
      returnNew: true,
    });
    return this._normalizeRecord(result.new!);
  }

  static async checkAndExpire(): Promise<number> {
    // Mark expired invitations
    const aql = `
      FOR inv IN invitations
        FILTER inv.status == "pending"
        FILTER inv.expires_at < @now
        UPDATE inv WITH { status: "expired" } IN invitations
        RETURN NEW
    `;

    const cursor = await collections.invitations.database.query(aql, {
      now: new Date().toISOString(),
    });
    const results = await cursor.all();

    return results.length;
  }

  static async delete(id: string): Promise<void> {
    const key = this._extractKey(id);
    try {
      await collections.invitations.remove(key);
    } catch (error: any) {
      if (error.errorNum !== 1202) {
        // 1202 is document not found, which is fine for delete
        throw error;
      }
    }
  }

  // Helper methods
  static _extractKey(id: string): string {
    // Handle both _key format and _id format
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): InvitationRecord {
    return {
      id: doc._id || `invitations/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      team_id: doc.team_id,
      invited_by: doc.invited_by,
      token: doc.token,
      status: doc.status,
      expires_at: doc.expires_at,
      accepted_at: doc.accepted_at,
      accepted_by: doc.accepted_by,
      created_at: doc.created_at,
    };
  }
}

