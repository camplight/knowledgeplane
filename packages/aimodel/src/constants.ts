/**
 * AI Model Constants - Single Source of Truth
 *
 * All model defaults should be defined here to ensure consistency
 * across the entire codebase.
 */

/**
 * Default OpenAI chat model
 * Updated: 2026-02-17 (gpt-4o deprecated)
 *
 * @see https://openai.com/index/retiring-gpt-4o-and-older-models/
 */
export const DEFAULT_OPENAI_MODEL = "gpt-5.1";

/**
 * Default OpenAI embedding model
 */
export const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Default Anthropic model
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";

/**
 * Relation types supported by CardConsolidator
 * Used for knowledge graph relation extraction
 */
export const RELATION_TYPES = [
  "references",
  "depends_on",
  "related_to",
  "part_of",
  "causes",
  "enables",
  "contradicts",
  "supports",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

/**
 * Get the configured OpenAI model from environment or default
 */
export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

/**
 * Get the configured Anthropic model from environment or default
 */
export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

/**
 * Get the configured chat model (prefers OpenAI, falls back to Anthropic)
 */
export function getChatModel(): string {
  return process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_OPENAI_MODEL;
}
