import { collections } from "../db";

export interface WebhookInput {
  url: string;
  events: string[]; // e.g., ["fact.created", "fact.updated", "card.created"]
  secret?: string; // Optional secret for webhook signature
  active?: boolean;
  created_by: string;
}

export interface WebhookRecord {
  _key?: string;
  _id?: string;
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookUpdateInput {
  id: string;
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

export class Webhook {
  static async create(input: WebhookInput): Promise<WebhookRecord> {
    const now = new Date().toISOString();
    const doc = {
      url: input.url,
      events: input.events,
      secret: input.secret || null,
      active: input.active !== undefined ? input.active : true,
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
    };

    const result = await collections.webhooks.save(doc, { returnNew: true });
    return this._normalizeRecord(result.new!);
  }

  static async update(input: WebhookUpdateInput): Promise<WebhookRecord> {
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.url !== undefined) updates.url = input.url;
    if (input.events !== undefined) updates.events = input.events;
    if (input.secret !== undefined) updates.secret = input.secret;
    if (input.active !== undefined) updates.active = input.active;

    const key = this._extractKey(input.id);
    const result = await collections.webhooks.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`Webhook with id ${input.id} not found`);
    }

    return this._normalizeRecord(result.new!);
  }

  static async findById(id: string): Promise<WebhookRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.webhooks.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async list(activeOnly: boolean = false): Promise<WebhookRecord[]> {
    let aql = `FOR webhook IN webhooks`;
    const bindVars: any = {};

    if (activeOnly) {
      aql += ` FILTER webhook.active == true`;
    }

    aql += ` SORT webhook.created_at DESC RETURN webhook`;

    const cursor = await collections.webhooks.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findByEvent(event: string): Promise<WebhookRecord[]> {
    const aql = `
      FOR webhook IN webhooks
        FILTER webhook.active == true
        FILTER @event IN webhook.events
        RETURN webhook
    `;

    const cursor = await collections.webhooks.database.query(aql, { event });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async delete(id: string): Promise<void> {
    const key = this._extractKey(id);
    await collections.webhooks.remove(key);
  }

  // Helper methods
  static _extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): WebhookRecord {
    return {
      id: doc._id || `webhooks/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      url: doc.url,
      events: doc.events || [],
      secret: doc.secret,
      active: doc.active !== undefined ? doc.active : true,
      created_by: doc.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

