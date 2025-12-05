import {
  DexcomIntegration,
  Fact,
  FactRelation,
  WorkerLog,
  DexcomClient,
} from "@knowledgeplane/db";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";

export class DexcomFetcher {
  private aiClient: ReturnType<typeof createAIModelClient>;
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("AI API key environment variable is required");
    }
    this.aiClient = createAIModelClient(
      (process.env.AI_PROVIDER as any) || "openai",
      apiKey,
    );
  }

  start() {
    console.log("Dexcom fetcher started");
    // Run every 15 minutes to check for integrations that need fetching
    this.interval = setInterval(
      () => {
        this.process().catch((error) => {
          console.error("Error in Dexcom fetching:", error);
        });
      },
      15 * 60 * 1000,
    );

    // Run immediately on start
    this.process().catch((error) => {
      console.error("Error in initial Dexcom fetching:", error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log("Dexcom fetcher stopped");
  }

  private async process() {
    if (this.running) {
      return; // Skip if already running
    }

    const startTime = Date.now();
    this.running = true;
    let integrationsProcessed = 0;
    let factsCreated = 0;
    let relationsCreated = 0;
    let errors: string[] = [];

    try {
      // Find integrations that are due for fetching
      const integrations = await DexcomIntegration.findDueForFetch();

      if (integrations.length === 0) {
        await WorkerLog.create({
          worker_name: "dexcom-fetcher",
          task_type: "fetch",
          status: "success",
          message: "No integrations due for fetching",
          execution_time_ms: Date.now() - startTime,
          items_processed: 0,
          items_created: 0,
        });
        return;
      }

      console.log(`Processing ${integrations.length} Dexcom integrations`);

      // Process each integration
      for (const integration of integrations) {
        try {
          const result = await this.fetchAndProcessIntegration(integration);
          integrationsProcessed++;
          factsCreated += result.factsCreated;
          relationsCreated += result.relationsCreated;

          // Update last_fetch_at
          await DexcomIntegration.update({
            id: integration.id,
            last_fetch_at: new Date().toISOString(),
          });

          // Create log entry for this integration
          await WorkerLog.create({
            worker_name: "dexcom-fetcher",
            task_type: "fetch",
            team_id: integration.team_id,
            status: "success",
            message: `Fetched Dexcom data: Created ${result.factsCreated} facts and ${result.relationsCreated} relations`,
            execution_time_ms: Date.now() - startTime,
            items_processed: 1,
            items_created: result.factsCreated + result.relationsCreated,
          });
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          errors.push(`Integration ${integration.id}: ${errorMsg}`);
          console.error(
            `Error processing Dexcom integration ${integration.id}:`,
            error,
          );

          // Create error log
          await WorkerLog.create({
            worker_name: "dexcom-fetcher",
            task_type: "fetch",
            team_id: integration.team_id,
            status: "error",
            message: `Failed to fetch Dexcom data: ${errorMsg}`,
            execution_time_ms: Date.now() - startTime,
            items_processed: 1,
            items_created: 0,
            error: errorMsg,
          });
        }
      }

      // Create summary log if multiple integrations were processed
      if (integrationsProcessed > 1) {
        const executionTime = Date.now() - startTime;
        await WorkerLog.create({
          worker_name: "dexcom-fetcher",
          task_type: "fetch",
          status: errors.length > 0 ? "partial" : "success",
          message: `Processed ${integrationsProcessed} integrations: Created ${factsCreated} facts and ${relationsCreated} relations. Errors: ${errors.length}`,
          execution_time_ms: executionTime,
          items_processed: integrationsProcessed,
          items_created: factsCreated + relationsCreated,
          error: errors.length > 0 ? errors.join("; ") : undefined,
        });
      }

      console.log(
        `Processed ${integrationsProcessed} integrations: Created ${factsCreated} facts and ${relationsCreated} relations`,
      );
    } catch (err: any) {
      const executionTime = Date.now() - startTime;
      await WorkerLog.create({
        worker_name: "dexcom-fetcher",
        task_type: "fetch",
        status: "error",
        message: "Dexcom fetching failed",
        execution_time_ms: executionTime,
        items_processed: integrationsProcessed,
        items_created: factsCreated + relationsCreated,
        error: err.message || String(err),
      });

      throw err;
    } finally {
      this.running = false;
    }
  }

  private async fetchAndProcessIntegration(integration: any): Promise<{
    factsCreated: number;
    relationsCreated: number;
  }> {
    // Create Dexcom client
    const client = new DexcomClient({
      clientId: integration.client_id,
      clientSecret: integration.client_secret,
      redirectUri: integration.redirect_uri,
      baseUrl: integration.base_url,
    });

    // Set access token and refresh if needed
    client.setAccessToken(integration.access_token);
    if (integration.token_expires_at) {
      const expiresAt = new Date(integration.token_expires_at);
      const expiresIn = Math.max(0, expiresAt.getTime() - Date.now()) / 1000;
      if (expiresIn < 300) {
        // Refresh if expires in less than 5 minutes
        try {
          const tokenData = await client.refreshAccessToken();
          await DexcomIntegration.update({
            id: integration.id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: new Date(
              Date.now() + tokenData.expires_in * 1000,
            ).toISOString(),
          });
          client.setAccessToken(tokenData.access_token);
        } catch (error) {
          console.error(
            `Failed to refresh token for integration ${integration.id}:`,
            error,
          );
          throw new Error(
            `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // Fetch all data from Dexcom API
    let dexcomData;
    try {
      // Calculate date range (last 24 hours or since last fetch)
      const endDate = new Date();
      let startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours

      if (integration.last_fetch_at) {
        const lastFetch = new Date(integration.last_fetch_at);
        startDate = lastFetch; // Fetch since last fetch
      }

      dexcomData = await client.fetchAllData(
        startDate.toISOString(),
        endDate.toISOString(),
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch data from Dexcom API: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Convert Dexcom data to JSON string for AI processing
    const dataJson = JSON.stringify(dexcomData, null, 2);

    // Use AI to extract facts from the Dexcom data
    const provider = this.aiClient.getProvider();
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
            integration_id: integration.id,
            fetched_at: new Date().toISOString(),
          },
          team_id: integration.team_id,
          created_by: integration.user_id,
          last_updated_by: integration.user_id,
        }),
      ),
    );

    // Create relations between facts
    let relationsCreated = 0;
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
          await FactRelation.create({
            from_fact: fromFact.id,
            to_fact: toFact.id,
            type: relation.type,
            metadata: relation.metadata || {},
            team_id: integration.team_id,
            created_by: integration.user_id,
          });
          relationsCreated++;
        } catch (error) {
          console.error("Failed to create relation:", error);
        }
      }
    }

    return {
      factsCreated: createdFacts.length,
      relationsCreated,
    };
  }
}

