CREATE INDEX IF NOT EXISTS fact_namespace_idx ON fact(namespace);
CREATE INDEX IF NOT EXISTS fact_created_idx ON fact(created_at DESC);
CREATE INDEX IF NOT EXISTS fact_embedding_idx ON fact USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

