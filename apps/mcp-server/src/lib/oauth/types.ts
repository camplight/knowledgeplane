export interface AuthorizationRequest {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  expires_at: number;
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  user_id: string;
  scope?: string;
  oauth_access_token: string; // Store the OAuth provider's access token to return it
  provider: "google" | "github";
  expires_at: number;
}

