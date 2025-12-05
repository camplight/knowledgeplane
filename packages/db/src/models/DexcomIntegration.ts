import { collections, ensureInitialized } from "../db";

export interface DexcomIntegrationInput {
  team_id: string;
  user_id: string; // User who set up the integration
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string; // ISO 8601 timestamp
  base_url?: string; // Defaults to sandbox
  enabled: boolean;
  fetch_interval_minutes?: number; // Defaults to 60 minutes
  last_fetch_at?: string; // ISO 8601 timestamp
  metadata?: Record<string, any>;
}

export interface DexcomIntegrationRecord {
  _key?: string;
  _id?: string;
  id: string;
  team_id: string;
  user_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
  base_url?: string;
  enabled: boolean;
  fetch_interval_minutes: number;
  last_fetch_at?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DexcomIntegrationUpdateInput {
  id: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: string;
  enabled?: boolean;
  fetch_interval_minutes?: number;
  last_fetch_at?: string;
  metadata?: Record<string, any>;
}

export class DexcomIntegration {
  static async create(
    input: DexcomIntegrationInput,
  ): Promise<DexcomIntegrationRecord> {
    await ensureInitialized();
    const now = new Date().toISOString();
    const doc = {
      team_id: input.team_id,
      user_id: input.user_id,
      client_id: input.client_id,
      client_secret: input.client_secret,
      redirect_uri: input.redirect_uri,
      access_token: input.access_token,
      refresh_token: input.refresh_token || null,
      token_expires_at: input.token_expires_at || null,
      base_url: input.base_url || "https://sandbox-api.dexcom.com",
      enabled: input.enabled !== false,
      fetch_interval_minutes: input.fetch_interval_minutes || 60,
      last_fetch_at: input.last_fetch_at || null,
      metadata: input.metadata || {},
      created_at: now,
      updated_at: now,
    };

    const result = await collections.dexcom_integrations.save(doc, {
      returnNew: true,
    });
    return this._normalizeRecord(result.new!);
  }

  static async update(
    input: DexcomIntegrationUpdateInput,
  ): Promise<DexcomIntegrationRecord> {
    await ensureInitialized();
    const key = this.extractKey(input.id);
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.access_token !== undefined) {
      updates.access_token = input.access_token;
    }
    if (input.refresh_token !== undefined) {
      updates.refresh_token = input.refresh_token;
    }
    if (input.token_expires_at !== undefined) {
      updates.token_expires_at = input.token_expires_at;
    }
    if (input.enabled !== undefined) {
      updates.enabled = input.enabled;
    }
    if (input.fetch_interval_minutes !== undefined) {
      updates.fetch_interval_minutes = input.fetch_interval_minutes;
    }
    if (input.last_fetch_at !== undefined) {
      updates.last_fetch_at = input.last_fetch_at;
    }
    if (input.metadata !== undefined) {
      updates.metadata = input.metadata;
    }

    const result = await collections.dexcom_integrations.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`DexcomIntegration with id ${input.id} not found`);
    }

    return this._normalizeRecord(result.new!);
  }

  static async findById(id: string): Promise<DexcomIntegrationRecord | null> {
    await ensureInitialized();
    const key = this.extractKey(id);
    try {
      const doc = await collections.dexcom_integrations.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        // Document not found
        return null;
      }
      throw error;
    }
  }

  static async findByTeam(
    teamId: string,
  ): Promise<DexcomIntegrationRecord[]> {
    await ensureInitialized();
    const aql = `
      FOR integration IN dexcom_integrations
        FILTER integration.team_id == @teamId
        RETURN integration
    `;

    const cursor = await collections.dexcom_integrations.database.query(aql, {
      teamId,
    });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findEnabled(): Promise<DexcomIntegrationRecord[]> {
    await ensureInitialized();
    const aql = `
      FOR integration IN dexcom_integrations
        FILTER integration.enabled == true
        RETURN integration
    `;

    const cursor = await collections.dexcom_integrations.database.query(aql);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findDueForFetch(): Promise<DexcomIntegrationRecord[]> {
    await ensureInitialized();
    const now = new Date().toISOString();
    const aql = `
      FOR integration IN dexcom_integrations
        FILTER integration.enabled == true
        FILTER integration.last_fetch_at == null OR 
          DATE_ADD(integration.last_fetch_at, integration.fetch_interval_minutes, "minutes") <= DATE_ISO8601(@now)
        RETURN integration
    `;

    const cursor = await collections.dexcom_integrations.database.query(aql, {
      now,
    });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async delete(id: string): Promise<void> {
    await ensureInitialized();
    const key = this.extractKey(id);
    await collections.dexcom_integrations.remove(key);
  }

  static extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): DexcomIntegrationRecord {
    return {
      id: doc._id || `dexcom_integrations/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      team_id: doc.team_id,
      user_id: doc.user_id,
      client_id: doc.client_id,
      client_secret: doc.client_secret,
      redirect_uri: doc.redirect_uri,
      access_token: doc.access_token,
      refresh_token: doc.refresh_token,
      token_expires_at: doc.token_expires_at,
      base_url: doc.base_url || "https://sandbox-api.dexcom.com",
      enabled: doc.enabled !== false,
      fetch_interval_minutes: doc.fetch_interval_minutes || 60,
      last_fetch_at: doc.last_fetch_at,
      metadata: doc.metadata || {},
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

