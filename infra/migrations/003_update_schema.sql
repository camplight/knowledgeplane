-- Drop old tables and create new schema
DROP TABLE IF EXISTS fact;
DROP TABLE IF EXISTS namespace;
DROP TABLE IF EXISTS org;

-- Create user table
CREATE TABLE "user" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL UNIQUE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create updated fact table
CREATE TABLE fact (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  last_updated_by uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  knowledge_context text DEFAULT ''
);

-- Create indexes
CREATE INDEX idx_fact_created_by ON fact(created_by);
CREATE INDEX idx_fact_last_updated_by ON fact(last_updated_by);
CREATE INDEX idx_fact_knowledge_context ON fact(knowledge_context);
CREATE INDEX idx_fact_content_search ON fact USING gin(to_tsvector('english', content));
CREATE INDEX idx_fact_updated_at ON fact(updated_at DESC);
CREATE INDEX idx_fact_created_at ON fact(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_fact_updated_at BEFORE UPDATE ON fact
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

