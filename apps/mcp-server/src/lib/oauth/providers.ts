import type { OAuthProvider } from "./templates.js";

export interface OAuthProviderConfig {
  name: OAuthProvider;
  clientId: string;
  clientSecret: string;
  authorizeHost: string;
  authorizePath: string;
  tokenHost: string;
  tokenPath: string;
  scope: string[];
  userInfoUrl: string;
  userInfoHeaders?: Record<string, string>;
  emailsUrl?: string;
  emailsHeaders?: Record<string, string>;
  getUsername: (userInfo: any) => string;
  getEmail: (userInfo: any) => string | null;
  fetchEmail?: (accessToken: string) => Promise<string | null>;
}

/**
 * Creates OAuth provider configuration from environment variables
 */
export function createProviderConfig(
  provider: OAuthProvider,
): OAuthProviderConfig | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    return {
      name: "google",
      clientId,
      clientSecret,
      authorizeHost: "https://accounts.google.com",
      authorizePath: "/o/oauth2/v2/auth",
      tokenHost: "https://oauth2.googleapis.com",
      tokenPath: "/token",
      scope: ["openid", "email", "profile"],
      userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
      getUsername: (userInfo: any) =>
        userInfo.email?.split("@")[0] || userInfo.id,
      getEmail: (userInfo: any) => userInfo.email || null,
    };
  }

  if (provider === "github") {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    return {
      name: "github",
      clientId,
      clientSecret,
      authorizeHost: "https://github.com",
      authorizePath: "/login/oauth/authorize",
      tokenHost: "https://github.com",
      tokenPath: "/login/oauth/access_token",
      scope: ["user:email"],
      userInfoUrl: "https://api.github.com/user",
      userInfoHeaders: {
        Accept: "application/vnd.github.v3+json",
      },
      emailsUrl: "https://api.github.com/user/emails",
      emailsHeaders: {
        Accept: "application/vnd.github.v3+json",
      },
      getUsername: (userInfo: any) =>
        userInfo.login || userInfo.id?.toString(),
      getEmail: (userInfo: any) => userInfo.email || null,
      fetchEmail: async (accessToken: string): Promise<string | null> => {
        const emailsResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );
        if (!emailsResponse.ok) return null;
        const emails = await emailsResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        return primaryEmail?.email || emails[0]?.email || null;
      },
    };
  }

  return null;
}

/**
 * Gets all available OAuth providers
 */
export function getAvailableProviders(): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (createProviderConfig("google")) providers.push("google");
  if (createProviderConfig("github")) providers.push("github");
  return providers;
}

