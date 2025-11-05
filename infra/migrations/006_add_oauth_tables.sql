-- OAuth authorization request table
-- Stores temporary authorization requests for OAuth 2.1 flow
CREATE TABLE IF NOT EXISTS oauth_authorization_request (
  key text PRIMARY KEY,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  state text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL,
  scope text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- OAuth authorization code table
-- Stores authorization codes for OAuth 2.1 token exchange
CREATE TABLE IF NOT EXISTS oauth_authorization_code (
  code text PRIMARY KEY,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  scope text,
  oauth_access_token text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google', 'github')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for efficient cleanup and lookups
CREATE INDEX IF NOT EXISTS idx_oauth_authorization_request_expires_at 
  ON oauth_authorization_request(expires_at);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_code_expires_at 
  ON oauth_authorization_code(expires_at);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_code_user_id 
  ON oauth_authorization_code(user_id);

