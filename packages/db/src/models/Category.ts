import { collections } from "../db";

export interface CategoryInput {
  name: string;
  description?: string;
  parent_id?: string; // Reference to parent category
  created_by: string;
}

export interface CategoryRecord {
  _key?: string;
  _id?: string;
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  path?: string[]; // Array of category IDs representing the path from root
}

export interface CategoryUpdateInput {
  id: string;
  name?: string;
  description?: string;
  parent_id?: string;
}

export class Category {
  static async create(input: CategoryInput): Promise<CategoryRecord> {
    const now = new Date().toISOString();
    const path = input.parent_id
      ? await this._calculatePath(input.parent_id)
      : [];

    const doc = {
      name: input.name,
      description: input.description || null,
      parent_id: input.parent_id || null,
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
      path: path,
    };

    const result = await collections.categories.save(doc, { returnNew: true });
    const category = this._normalizeRecord(result.new!);
    
    // Update path to include this category
    category.path = [...path, category.id];
    await this.update({ id: category.id, name: category.name }, category);
    
    return category;
  }

  static async update(
    input: CategoryUpdateInput,
    existing?: CategoryRecord,
  ): Promise<CategoryRecord> {
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;

    // If parent_id changes, recalculate path
    if (input.parent_id !== undefined) {
      const path = input.parent_id
        ? await this._calculatePath(input.parent_id)
        : [];
      updates.parent_id = input.parent_id;
      updates.path = path;
      
      // If we have the existing category, add it to the path
      if (existing) {
        updates.path = [...path, existing.id];
      }
    }

    const key = this._extractKey(input.id);
    const result = await collections.categories.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`Category with id ${input.id} not found`);
    }

    return this._normalizeRecord(result.new!);
  }

  static async findById(id: string): Promise<CategoryRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.categories.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async list(
    parent_id?: string,
  ): Promise<CategoryRecord[]> {
    let aql = `FOR category IN categories`;
    const bindVars: any = {};
    const filters: string[] = [];

    if (parent_id !== undefined) {
      if (parent_id === null) {
        filters.push(`category.parent_id == null`);
      } else {
        filters.push(`category.parent_id == @parentId`);
        bindVars.parentId = parent_id;
      }
    }

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += ` SORT category.name RETURN category`;

    const cursor = await collections.categories.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async getTree(): Promise<CategoryRecord[]> {
    // Get all categories and build tree structure
    const categories = await this.list();
    return this._buildTree(categories);
  }

  static async queryAQL(aql: string, bindVars?: any): Promise<any[]> {
    const cursor = await collections.categories.database.query(
      aql,
      bindVars || {},
    );
    return await cursor.all();
  }

  // Helper methods
  static _extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static async _calculatePath(parentId: string): Promise<string[]> {
    const parent = await this.findById(parentId);
    if (!parent) {
      return [];
    }
    return parent.path || [parent.id];
  }

  static _buildTree(categories: CategoryRecord[]): CategoryRecord[] {
    const categoryMap = new Map<string, CategoryRecord>();
    const roots: CategoryRecord[] = [];

    // Create map of all categories
    for (const category of categories) {
      categoryMap.set(category.id, category);
    }

    // Build tree
    for (const category of categories) {
      if (!category.parent_id) {
        roots.push(category);
      }
    }

    return roots;
  }

  static _normalizeRecord(doc: any): CategoryRecord {
    return {
      id: doc._id || `categories/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      name: doc.name,
      description: doc.description,
      parent_id: doc.parent_id,
      created_by: doc.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      path: doc.path || [],
    };
  }
}

