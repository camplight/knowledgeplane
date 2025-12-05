import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DexcomClient } from "../../lib/dexcom/client.js";
import { Fact, FactRelation } from "@knowledgeplane/db";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";

export const dexcomFetchTool: Tool = {
  name: "dexcom.fetch",
  description:
    "Fetch all data from Dexcom API and convert it into facts. Requires OAuth 2.0 authentication with Dexcom. The tool fetches EGVs (glucose values), calibrations, alerts, devices, events, and data range, then uses AI to extract meaningful facts from the data.",
  inputSchema: {
    type: "object",
    properties: {
      access_token: {
        type: "string",
        description:
          "Dexcom OAuth 2.0 access token. If not provided, will use DEXCOM_ACCESS_TOKEN from environment.",
      },
      client_id: {
        type: "string",
        description:
          "Dexcom API client ID. If not provided, will use DEXCOM_CLIENT_ID from environment.",
      },
      client_secret: {
        type: "string",
        description:
          "Dexcom API client secret. If not provided, will use DEXCOM_CLIENT_SECRET from environment.",
      },
      redirect_uri: {
        type: "string",
        description:
          "OAuth redirect URI. If not provided, will use DEXCOM_REDIRECT_URI from environment.",
      },
      base_url: {
        type: "string",
        description:
          "Dexcom API base URL. Defaults to sandbox (https://sandbox-api.dexcom.com). Use https://api.dexcom.com for production.",
      },
      start_date: {
        type: "string",
        description:
          "Start date for data range (ISO 8601 format, e.g., '2024-01-01T00:00:00'). If not provided, uses available data range.",
      },
      end_date: {
        type: "string",
        description:
          "End date for data range (ISO 8601 format, e.g., '2024-01-31T23:59:59'). If not provided, uses available data range.",
      },
      team_id: {
        type: "string",
        description: "Team ID (optional, inferred from session if authenticated)",
      },
      created_by: {
        type: "string",
        description:
          "User ID of the creator (optional, inferred from session if authenticated)",
      },
    },
    required: [],
  },
};

export async function handleDexcomFetch(args: {
  access_token?: string;
  client_id?: string;
  client_secret?: string;
  redirect_uri?: string;
  base_url?: string;
  start_date?: string;
  end_date?: string;
  team_id?: string;
  created_by?: string;
}) {
  // Validate that user ID and team_id are provided (should be merged from context by server.ts)
  if (!args.created_by) {
    throw new Error(
      "User ID is required. Either provide created_by, or authenticate via session.",
    );
  }
  if (!args.team_id) {
    throw new Error(
      "Team ID is required. Team ID should be automatically inferred from authenticated session context.",
    );
  }

  // Get configuration from args or environment
  const clientId = args.client_id || process.env.DEXCOM_CLIENT_ID;
  const clientSecret =
    args.client_secret || process.env.DEXCOM_CLIENT_SECRET;
  const redirectUri = args.redirect_uri || process.env.DEXCOM_REDIRECT_URI;
  const accessToken = args.access_token || process.env.DEXCOM_ACCESS_TOKEN;
  const baseUrl = args.base_url || process.env.DEXCOM_BASE_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Dexcom API credentials are required. Provide client_id, client_secret, and redirect_uri, or set DEXCOM_CLIENT_ID, DEXCOM_CLIENT_SECRET, and DEXCOM_REDIRECT_URI environment variables.",
    );
  }

  if (!accessToken) {
    throw new Error(
      "Dexcom access token is required. Provide access_token or set DEXCOM_ACCESS_TOKEN environment variable. Use dexcom.getAuthUrl to get authorization URL first.",
    );
  }

  // Create Dexcom client
  const client = new DexcomClient({
    clientId,
    clientSecret,
    redirectUri,
    baseUrl,
  });

  // Set access token
  client.setAccessToken(accessToken);

  // Fetch all data from Dexcom API
  let dexcomData;
  try {
    dexcomData = await client.fetchAllData(args.start_date, args.end_date);
  } catch (error) {
    throw new Error(
      `Failed to fetch data from Dexcom API: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Convert Dexcom data to JSON string for AI processing
  const dataJson = JSON.stringify(dexcomData, null, 2);

  // Use AI to extract facts from the Dexcom data
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for fact extraction");
  }

  const aiClient = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    apiKey,
  );
  const provider = aiClient.getProvider();
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const temperature = 0.3;

  const systemPrompt = `You are a knowledge extraction agent specialized in medical data. Your task is to analyze Dexcom CGM (Continuous Glucose Monitoring) data and extract:
1. Facts - discrete pieces of information that should be stored
2. Relations - relationships between facts

The Dexcom data includes:
- EGVs (Estimated Glucose Values): Glucose readings with timestamps, trends, and status
- Calibrations: Calibration entries with values and timestamps
- Alerts: Alert notifications with types, names, and values
- Devices: Device information including transmitter generation and settings
- Events: User-entered events like meals, exercise, etc.
- Data Range: Available data periods

For each fact, provide:
- content: A clear, concise statement of the fact (e.g., "Glucose reading was 120 mg/dL at 2:30 PM on 2024-01-15")
- metadata: Key-value pairs with additional context (timestamp, value, type, etc.)

For each relation, provide:
- from_content: The content of the source fact
- to_content: The content of the target fact
- type: The type of relationship (references, related_to, precedes, follows, etc.)
- metadata: Optional additional information

Extract meaningful facts that would be useful for understanding glucose patterns, trends, and health insights. Group related information into coherent facts.

Return your response as JSON with this structure:
{
  "facts": [
    {
      "content": "Fact content here",
      "metadata": {"source": "dexcom", "type": "egv", "timestamp": "2024-01-15T14:30:00", "value": 120, "unit": "mg/dL"}
    }
  ],
  "relations": [
    {
      "from_content": "Source fact content",
      "to_content": "Target fact content",
      "type": "precedes",
      "metadata": {}
    }
  ]
}`;

  const userPrompt = `Extract facts and relations from the following Dexcom CGM data:

${dataJson}

Analyze the data and extract all relevant facts and their relationships. Focus on:
- Glucose readings and their patterns
- Trends and changes over time
- Alerts and their significance
- Device information
- User events and their context
- Relationships between different data points`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const chatOptions: ChatCompletionOptions = {
    model,
    temperature,
    responseFormat: "json_object",
  };

  let extractionResult;
  try {
    const response = await provider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = JSON.parse(response.content);
    extractionResult = {
      facts: parsed.facts || [],
      relations: parsed.relations || [],
    };
  } catch (error) {
    throw new Error(
      `Failed to extract facts from Dexcom data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Create facts in the database
  const createdFacts = await Promise.all(
    extractionResult.facts.map((fact: any) =>
      Fact.write({
        content: fact.content,
        metadata: {
          ...fact.metadata,
          source: "dexcom_api",
          fetched_at: new Date().toISOString(),
        },
        team_id: args.team_id,
        created_by: args.created_by,
        last_updated_by: args.created_by,
      }),
    ),
  );

  // Create relations between facts
  const createdRelations: any[] = [];
  for (const relation of extractionResult.relations) {
    // Find matching facts by content
    const fromFact = createdFacts.find(
      (f) => f.content === relation.from_content,
    );
    const toFact = createdFacts.find(
      (f) => f.content === relation.to_content,
    );

    if (fromFact && toFact) {
      try {
        const rel = await FactRelation.create({
          from_fact: fromFact.id,
          to_fact: toFact.id,
          type: relation.type,
          metadata: relation.metadata || {},
          team_id: args.team_id,
          created_by: args.created_by,
        });
        createdRelations.push(rel);
      } catch (error) {
        console.error("Failed to create relation:", error);
      }
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            dexcom_data_summary: {
              egvs_count: dexcomData.egvs.length,
              calibrations_count: dexcomData.calibrations.length,
              alerts_count: dexcomData.alerts.length,
              devices_count: dexcomData.devices.length,
              events_count: dexcomData.events.length,
              data_range: dexcomData.dataRange,
            },
            facts_created: createdFacts.length,
            relations_created: createdRelations.length,
            facts: createdFacts.map((f) => ({
              id: f.id,
              content: f.content.substring(0, 100) + "...",
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}

