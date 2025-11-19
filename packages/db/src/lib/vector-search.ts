import type { AIModelProvider } from "@knowledgeplane/aimodel";

/**
 * Generate embedding for a query string
 */
export async function generateQueryEmbedding(
  query: string,
  provider: AIModelProvider,
  model?: string,
): Promise<number[]> {
  const embeddingModel = model || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  
  try {
    const result = await provider.embeddings(query, embeddingModel);
    if (result.embeddings.length === 0) {
      throw new Error("No embeddings returned from provider");
    }
    return result.embeddings[0];
  } catch (error: any) {
    throw new Error(`Failed to generate query embedding: ${error.message}`);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between 0 and 1, where 1 is most similar
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimension");
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }
  
  return dotProduct / denominator;
}

