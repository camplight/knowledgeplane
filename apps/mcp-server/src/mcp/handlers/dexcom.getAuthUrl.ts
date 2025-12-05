import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DexcomClient } from "../../lib/dexcom/client.js";

export const dexcomGetAuthUrlTool: Tool = {
  name: "dexcom.getAuthUrl",
  description:
    "Get the Dexcom OAuth 2.0 authorization URL for user authentication. Users need to visit this URL to authorize access to their Dexcom CGM data.",
  inputSchema: {
    type: "object",
    properties: {
      client_id: {
        type: "string",
        description:
          "Dexcom API client ID. If not provided, will use DEXCOM_CLIENT_ID from environment.",
      },
      redirect_uri: {
        type: "string",
        description:
          "OAuth redirect URI. If not provided, will use DEXCOM_REDIRECT_URI from environment.",
      },
      scopes: {
        type: "array",
        items: { type: "string" },
        description:
          "OAuth scopes to request. Defaults to ['egv', 'calibrations', 'events', 'devices'].",
      },
      state: {
        type: "string",
        description: "Optional state parameter for OAuth flow security.",
      },
      base_url: {
        type: "string",
        description:
          "Dexcom API base URL. Defaults to sandbox (https://sandbox-api.dexcom.com). Use https://api.dexcom.com for production.",
      },
    },
    required: [],
  },
};

export async function handleDexcomGetAuthUrl(args: {
  client_id?: string;
  redirect_uri?: string;
  scopes?: string[];
  state?: string;
  base_url?: string;
}) {
  const clientId = args.client_id || process.env.DEXCOM_CLIENT_ID;
  const redirectUri = args.redirect_uri || process.env.DEXCOM_REDIRECT_URI;
  const baseUrl = args.base_url || process.env.DEXCOM_BASE_URL;

  if (!clientId || !redirectUri) {
    throw new Error(
      "Dexcom API credentials are required. Provide client_id and redirect_uri, or set DEXCOM_CLIENT_ID and DEXCOM_REDIRECT_URI environment variables.",
    );
  }

  const client = new DexcomClient({
    clientId,
    clientSecret: "", // Not needed for auth URL
    redirectUri,
    baseUrl,
  });

  const authUrl = client.getAuthorizationUrl(
    args.state,
    args.scopes || ["egv", "calibrations", "events", "devices"],
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            authorization_url: authUrl,
            instructions:
              "Visit this URL in your browser to authorize access to your Dexcom CGM data. After authorization, you will receive an authorization code that can be exchanged for an access token.",
          },
          null,
          2,
        ),
      },
    ],
  };
}

