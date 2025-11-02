CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE org (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE namespace (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sensitivity text NOT NULL DEFAULT 'low'
);

-- 768-dim embeddings by default; adjust as needed
CREATE TABLE fact (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  namespace text NOT NULL,
  content text NOT NULL,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  embedding vector(768),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- A placeholder SQL function; swap to external embedding service in prod.
-- Returns a zero vector as placeholder - replace with real embedding service
CREATE OR REPLACE FUNCTION embedding_fn(input text) RETURNS vector(768) AS $$
  SELECT ('[' || repeat('0.0,', 767) || '0.0]')::vector(768);
$$ LANGUAGE SQL IMMUTABLE;

