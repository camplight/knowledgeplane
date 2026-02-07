type EmbeddingRecord = {
  embedding?: unknown;
  embedding_model?: unknown;
  _id?: unknown;
  _key?: unknown;
};

export function stripEmbeddings<T extends EmbeddingRecord>(
  record: T,
): Omit<T, "embedding" | "embedding_model" | "_id" | "_key"> {
  if (!record) {
    return record as Omit<T, "embedding" | "embedding_model" | "_id" | "_key">;
  }
  const { embedding, embedding_model, _id, _key, ...rest } = record as EmbeddingRecord &
    Record<string, unknown>;
  return rest as Omit<T, "embedding" | "embedding_model" | "_id" | "_key">;
}

export function stripEmbeddingsArray<T extends EmbeddingRecord>(
  records: T[],
): Array<Omit<T, "embedding" | "embedding_model" | "_id" | "_key">> {
  return records.map((record) => stripEmbeddings(record));
}
