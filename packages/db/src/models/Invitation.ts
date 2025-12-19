import { collections } from "../db";
import crypto from "crypto";

export interface InvitationAcceptance {
  user_id: string; // User ID who accepted the invitation
  accepted_at: string; // ISO 8601 timestamp
}

export interface InvitationRecord {
  _key?: string;
  _id?: string;
  id: string;
  workspace_id: string; // Workspace ID
  invited_by: string; // User ID
  token: string; // Unique invitation token (personal invitation link)
  status: "pending" | "accepted" | "expired";
  expires_at: string; // ISO 8601 timestamp
  acceptances?: InvitationAcceptance[]; // Array of acceptances (multiple users can accept the same invitation)
  // Legacy fields for backward compatibility (deprecated)
  accepted_at?: string; // ISO 8601 timestamp (deprecated, use acceptances array)
  accepted_by?: string; // User ID who accepted the invitation (deprecated, use acceptances array)
  created_at: string; // ISO 8601 timestamp
}

export interface InvitationInput {
  workspace_id: string; // Workspace ID
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
      workspace_id: input.workspace_id,
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

  static async findByWorkspace(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<InvitationRecord[]> {
    const aql = `
      FOR inv IN invitations
        FILTER inv.workspace_id == @workspaceId
        SORT inv.created_at DESC
        LIMIT @offset, @limit
        RETURN inv
    `;

    const cursor = await collections.invitations.database.query(aql, {
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

  static async findByAcceptedBy(userId: string): Promise<InvitationRecord[]> {
    // Check both old format (accepted_by) and new format (acceptances array)
    const aql = `
      FOR inv IN invitations
        FILTER inv.accepted_by == @userId || 
               (inv.acceptances != null && @userId IN inv.acceptances[*].user_id)
        SORT inv.created_at DESC
        RETURN inv
    `;

    const cursor = await collections.invitations.database.query(aql, { userId });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async list(
    workspaceId?: string,
    limit: number = 50,
    offset: number = 0,
    status?: "pending" | "accepted" | "expired",
  ): Promise<InvitationRecord[]> {
    let aql = `
      FOR inv IN invitations
    `;

    const filters: string[] = [];
    const bindVars: any = { limit, offset };

    if (workspaceId) {
      filters.push(`inv.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
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
    workspaceId?: string,
    status?: "pending" | "accepted" | "expired",
  ): Promise<number> {
    let aql = `
      LET count = LENGTH(
        FOR inv IN invitations
    `;

    const filters: string[] = [];
    const bindVars: any = {};

    if (workspaceId) {
      filters.push(`inv.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
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

    // Check if invitation is expired (but don't prevent acceptance if status is expired)
    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      // Mark as expired if not already
      if (invitation.status !== "expired") {
        const key = this._extractKey(invitation.id);
        await collections.invitations.update(key, {
          status: "expired",
        });
      }
      throw new Error("Invitation has expired");
    }

    // Check if user has already accepted this invitation
    const hasAccepted = invitation.acceptances?.some(
      (acc) => acc.user_id === userId,
    ) || invitation.accepted_by === userId; // Check legacy field too

    if (hasAccepted) {
      // User already accepted, but that's okay - just return the invitation
      return invitation;
    }

    const key = this._extractKey(invitation.id);
    
    // Get current acceptances array or initialize it
    const currentDoc = await collections.invitations.document(key);
    const currentAcceptances = currentDoc.acceptances || [];
    
    // If there's legacy accepted_by/accepted_at, migrate it to acceptances array
    if (currentDoc.accepted_by && !currentAcceptances.some((acc: any) => acc.user_id === currentDoc.accepted_by)) {
      currentAcceptances.push({
        user_id: currentDoc.accepted_by,
        accepted_at: currentDoc.accepted_at || new Date().toISOString(),
      });
    }

    // Add new acceptance
    const newAcceptance: InvitationAcceptance = {
      user_id: userId,
      accepted_at: new Date().toISOString(),
    };
    currentAcceptances.push(newAcceptance);

    // Update invitation with new acceptance
    // Keep status as "pending" so it can be accepted multiple times
    const result = await collections.invitations.update(
      key,
      {
        acceptances: currentAcceptances,
        // Keep status as pending (or active) - don't mark as "accepted" since it can be reused
        status: invitation.status === "expired" ? "expired" : "pending",
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
    // Migrate legacy accepted_by/accepted_at to acceptances array if needed
    let acceptances = doc.acceptances || [];
    if (doc.accepted_by && !acceptances.some((acc: any) => acc.user_id === doc.accepted_by)) {
      acceptances = [
        ...acceptances,
        {
          user_id: doc.accepted_by,
          accepted_at: doc.accepted_at || new Date().toISOString(),
        },
      ];
    }

    return {
      id: doc._id || `invitations/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      workspace_id: doc.workspace_id,
      invited_by: doc.invited_by,
      token: doc.token,
      status: doc.status,
      expires_at: doc.expires_at,
      acceptances: acceptances.length > 0 ? acceptances : undefined,
      // Keep legacy fields for backward compatibility
      accepted_at: doc.accepted_at,
      accepted_by: doc.accepted_by,
      created_at: doc.created_at,
    };
  }
}

