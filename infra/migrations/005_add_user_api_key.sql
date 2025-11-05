-- Add api_key column to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS api_key text;

-- Create unique index on api_key to ensure one user per API key
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_key ON "user"(api_key) WHERE api_key IS NOT NULL;

