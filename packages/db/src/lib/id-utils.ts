/**
 * Shared utilities for consistent ID handling across the system
 *
 * ArangoDB stores documents with _key and _id:
 * - _key: "668" (just the key)
 * - _id: "workspaces/668" (collection/key format)
 *
 * This utility ensures consistent ID format handling.
 */

/**
 * Extract just the key from a full ID or return the key if already extracted
 * @param id - Either "668" or "workspaces/668"
 * @returns "668"
 */
export function extractKey(id: string): string {
  if (id.includes("/")) {
    return id.split("/")[1];
  }
  return id;
}

/**
 * Normalize an ID to full format (collection/key)
 * @param id - Either "668" or "workspaces/668"
 * @param collection - Collection name (e.g., "workspaces", "facts")
 * @returns "workspaces/668"
 */
export function normalizeId(id: string, collection: string): string {
  // Already in full format
  if (id.includes("/")) {
    return id;
  }
  // Convert key to full format
  return `${collection}/${id}`;
}

/**
 * Check if an ID is in full format (collection/key)
 */
export function isFullId(id: string): boolean {
  return id.includes("/");
}

/**
 * Get collection name from a full ID
 * @param id - Full ID like "workspaces/668"
 * @returns "workspaces"
 */
export function getCollection(id: string): string | null {
  if (!id.includes("/")) {
    return null;
  }
  return id.split("/")[0];
}
