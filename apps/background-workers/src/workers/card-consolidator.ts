import {
  Fact,
  KnowledgeCard,
  FactRelation,
  WorkerLog,
  collections,
} from "@knowledgeplane/db";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
  getChatModel,
} from "@knowledgeplane/aimodel";

export class CardConsolidator {
  private aiClient: ReturnType<typeof createAIModelClient>;
  private interval: NodeJS.Timeout | null = null;
  private triggerCheckInterval: NodeJS.Timeout | null = null;
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
    console.log("Card consolidator started");
    // Run every 5 minutes
    this.interval = setInterval(
      () => {
        this.process().catch((error) => {
          console.error("Error in card consolidation:", error);
        });
      },
      5 * 60 * 1000,
    );

    // Check for manual triggers every 30 seconds
    this.triggerCheckInterval = setInterval(() => {
      this.checkAndProcessTrigger().catch((error) => {
        console.error("Error checking for triggers:", error);
      });
    }, 30 * 1000);

    // Run immediately on start
    this.process().catch((error) => {
      console.error("Error in initial card consolidation:", error);
    });

    // Check for triggers immediately on start
    this.checkAndProcessTrigger().catch((error) => {
      console.error("Error checking for initial triggers:", error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.triggerCheckInterval) {
      clearInterval(this.triggerCheckInterval);
      this.triggerCheckInterval = null;
    }
    this.running = false;
    console.log("Card consolidator stopped");
  }

  private async checkAndProcessTrigger() {
    // Skip if worker is already running - will check again on next interval
    if (this.running) {
      return;
    }

    try {
      // Check for pending triggers for this worker
      const aql = `
        FOR trigger IN worker_triggers
          FILTER trigger.worker_name == "card-consolidator"
          FILTER trigger.status == "pending"
          SORT trigger.created_at ASC
          LIMIT 1
          RETURN trigger
      `;

      const cursor = await collections.worker_triggers.database.query(aql);
      const triggers = await cursor.all();

      if (triggers.length === 0) {
        return; // No pending triggers
      }

      const trigger = triggers[0];
      const triggerId = trigger._id || `worker_triggers/${trigger._key}`;
      const triggerKey = trigger._key;

      console.log(
        `Manual trigger detected for card-consolidator (trigger ID: ${triggerId})`,
      );

      // Mark trigger as processing
      await collections.worker_triggers.update(triggerKey, {
        status: "processing",
        updated_at: new Date().toISOString(),
      });

      // Process the worker
      await this.process();

      // Mark trigger as completed
      await collections.worker_triggers.update(triggerKey, {
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log(`Trigger ${triggerId} completed successfully`);
    } catch (error: any) {
      console.error("Error processing trigger:", error);
      // Try to mark trigger as failed if we can find it
      try {
        const aql = `
          FOR trigger IN worker_triggers
            FILTER trigger.worker_name == "card-consolidator"
            FILTER trigger.status == "processing"
            SORT trigger.created_at DESC
            LIMIT 1
            RETURN trigger
        `;
        const cursor = await collections.worker_triggers.database.query(aql);
        const triggers = await cursor.all();
        if (triggers.length > 0) {
          const trigger = triggers[0];
          await collections.worker_triggers.update(trigger._key, {
            status: "failed",
            error: error.message || String(error),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (updateError) {
        console.error("Failed to update trigger status:", updateError);
      }
    }
  }

  private async process() {
    if (this.running) {
      return; // Skip if already running
    }

    const startTime = Date.now();
    this.running = true;
    let cardsCreated = 0;
    let factsProcessed = 0;
    let relationsCreated = 0;
    let error: string | undefined;
    const workspacesProcessed = new Set<string>();

    try {
      // Get facts that haven't been consolidated into knowledge cards
      const facts = await this.getUnconsolidatedFacts();

      if (facts.length === 0) {
        await WorkerLog.create({
          worker_name: "card-consolidator",
          task_type: "consolidation",
          status: "success",
          message: "No unconsolidated facts found",
          execution_time_ms: Date.now() - startTime,
          items_processed: 0,
          items_created: 0,
        });
        return;
      }

      factsProcessed = facts.length;
      console.log(`Processing ${facts.length} unconsolidated facts`);

      // Group facts by workspace first
      const factsByWorkspace = new Map<string, any[]>();
      for (const fact of facts) {
        const workspaceId = fact.workspace_id;
        if (workspaceId) {
          if (!factsByWorkspace.has(workspaceId)) {
            factsByWorkspace.set(workspaceId, []);
          }
          factsByWorkspace.get(workspaceId)!.push(fact);
          workspacesProcessed.add(workspaceId);
        }
      }

      // Process each workspace separately
      for (const [workspaceId, workspaceFacts] of factsByWorkspace) {
        console.log(`Processing ${workspaceFacts.length} facts for workspace ${workspaceId}`);

        // Create fact relations before grouping
        const workspaceRelationsCreated = await this.createFactRelations(workspaceFacts);
        relationsCreated += workspaceRelationsCreated;

        // Group facts by related clusters using graph traversal
        const factClusters = await this.groupRelatedFacts(workspaceFacts);

        for (const cluster of factClusters) {
          const knowledgeCard = await this.consolidateCluster(cluster);
          if (knowledgeCard) {
            cardsCreated++;
          }
        }

        // Create log entry for this workspace
        const executionTime = Date.now() - startTime;
        await WorkerLog.create({
          worker_name: "card-consolidator",
          task_type: "consolidation",
          workspace_id: workspaceId,
          status: "success",
          message: `Created ${workspaceRelationsCreated} relations and consolidated ${workspaceFacts.length} facts into ${factClusters.length} knowledge cards`,
          execution_time_ms: executionTime,
          items_processed: workspaceFacts.length,
          items_created: factClusters.length,
        });
      }

      // Create summary log if multiple workspaces were processed
      if (workspacesProcessed.size > 1) {
        const executionTime = Date.now() - startTime;
        await WorkerLog.create({
          worker_name: "card-consolidator",
          task_type: "consolidation",
          status: "success",
          message: `Processed ${workspacesProcessed.size} workspaces: Created ${relationsCreated} relations and consolidated ${factsProcessed} facts into ${cardsCreated} knowledge cards`,
          execution_time_ms: executionTime,
          items_processed: factsProcessed,
          items_created: cardsCreated,
        });
      }

      console.log(
        `Created ${relationsCreated} relations and ${cardsCreated} knowledge cards from ${factsProcessed} facts`,
      );
    } catch (err: any) {
      error = err.message || String(err);
      const executionTime = Date.now() - startTime;

      // Create error logs for each workspace that was being processed
      for (const workspaceId of workspacesProcessed) {
        await WorkerLog.create({
          worker_name: "card-consolidator",
          task_type: "consolidation",
          workspace_id: workspaceId,
          status: "error",
          message: "Card consolidation failed",
          execution_time_ms: executionTime,
          items_processed: factsProcessed,
          items_created: cardsCreated,
          error: error,
        });
      }

      // Also create a general error log if no workspaces were tracked
      if (workspacesProcessed.size === 0) {
        await WorkerLog.create({
          worker_name: "card-consolidator",
          task_type: "consolidation",
          status: "error",
          message: "Card consolidation failed",
          execution_time_ms: executionTime,
          items_processed: factsProcessed,
          items_created: cardsCreated,
          error: error,
        });
      }

      throw err;
    } finally {
      this.running = false;
    }
  }

  private async getUnconsolidatedFacts(): Promise<any[]> {
    // Get facts that are not in any knowledge card's fact_ids
    // Only process facts that have a workspace_id (workspace-scoped facts)
    const aql = `
      FOR fact IN facts
        FILTER fact.trashed == false
        FILTER fact.workspace_id != null AND fact.workspace_id != ""
        LET inCard = (
          FOR card IN knowledge_cards
            FILTER fact._id IN card.fact_ids
            LIMIT 1
            RETURN true
        )
        FILTER LENGTH(inCard) == 0
        LIMIT 100
        RETURN fact
    `;

    return await Fact.queryAQL(aql);
  }

  private async createFactRelations(facts: any[]): Promise<number> {
    if (facts.length < 2) {
      return 0; // Need at least 2 facts to create relations
    }

    let relationsCreated = 0;
    const batchSize = 20; // Process facts in batches to avoid overwhelming the AI

    // Process facts in batches
    for (let i = 0; i < facts.length; i += batchSize) {
      const batch = facts.slice(i, Math.min(i + batchSize, facts.length));

      try {
        const relations = await this.identifyRelationsWithAI(batch);

        // Create relations that don't already exist
        for (const relation of relations) {
          // Use 1-based indices from AI response (convert to 0-based for array access)
          const fromFact = batch[relation.from_index - 1];
          const toFact = batch[relation.to_index - 1];

          if (!fromFact || !toFact) {
            console.warn(`Invalid fact indices: from=${relation.from_index}, to=${relation.to_index}`);
            continue; // Skip if facts not found in batch
          }

          const fromFactId = fromFact._id || fromFact.id;
          const toFactId = toFact._id || toFact.id;

          // Ensure both facts belong to the same workspace
          const fromFactWorkspaceId = fromFact.workspace_id;
          const toFactWorkspaceId = toFact.workspace_id;

          if (!fromFactWorkspaceId || !toFactWorkspaceId) {
            console.warn(
              `Skipping relation: facts missing workspace_id (from: ${fromFactWorkspaceId}, to: ${toFactWorkspaceId})`,
            );
            continue;
          }

          if (fromFactWorkspaceId !== toFactWorkspaceId) {
            console.warn(
              `Skipping relation: facts belong to different workspaces (from: ${fromFactWorkspaceId}, to: ${toFactWorkspaceId})`,
            );
            continue;
          }

          // Check if relation already exists
          const existingRelations = await FactRelation.query({
            from_fact: fromFactId,
            to_fact: toFactId,
            type: relation.type,
            workspace_id: fromFactWorkspaceId,
          });

          if (existingRelations.length === 0) {
            try {
              await FactRelation.create({
                from_fact: fromFactId,
                to_fact: toFactId,
                type: relation.type,
                workspace_id: fromFactWorkspaceId,
                metadata: {
                  reason: relation.reason || "",
                  source: "card-consolidator",
                  created_at: new Date().toISOString(),
                },
                created_by: "system",
              });
              relationsCreated++;
              console.log(`Created relation: ${fromFactId} --[${relation.type}]--> ${toFactId}`);
            } catch (error: any) {
              // Relation might already exist or there's a constraint issue, skip
              console.warn(
                `Failed to create relation between ${fromFactId} and ${toFactId}:`,
                error.message,
              );
            }
          }
        }
      } catch (error: any) {
        console.error(
          `Error creating relations for batch ${i}-${Math.min(i + batchSize, facts.length)}:`,
          error.message,
        );
        // Continue with next batch
      }
    }

    return relationsCreated;
  }

  private async identifyRelationsWithAI(facts: any[]): Promise<
    Array<{
      from_index: number;
      to_index: number;
      type: string;
      reason?: string;
    }>
  > {
    // Valid relation types - constrained to prevent arbitrary types
    const VALID_RELATION_TYPES = [
      "references",
      "depends_on",
      "related_to",
      "part_of",
      "causes",
      "enables",
      "contradicts",
      "supports",
    ];

    const systemPrompt = `You are a knowledge graph relation identification agent. Analyze facts and identify meaningful relationships.

IMPORTANT: Use fact NUMBERS (1-based index) to identify facts, NOT the fact content.

Valid relationship types (use ONLY these):
${VALID_RELATION_TYPES.map(t => `- "${t}"`).join("\n")}

Return JSON with this EXACT structure:
{
  "relations": [
    {
      "from_index": 1,
      "to_index": 2,
      "type": "related_to",
      "reason": "Brief explanation"
    }
  ]
}

Rules:
- from_index and to_index must be valid fact numbers (1 to N)
- type must be one of the valid types listed above
- Only identify meaningful relationships, not every possible pair
- Focus on significant connections`;

    const factContents = facts
      .map((f, idx) => `${idx + 1}. ${f.content}`)
      .join("\n");

    const userPrompt = `Analyze these ${facts.length} facts and identify meaningful relationships:

${factContents}

Return relationships using fact NUMBERS (1-${facts.length}), not content.`;

    const provider = this.aiClient.getProvider();
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const chatOptions: ChatCompletionOptions = {
      model: getChatModel(),
      temperature: 0.3, // Lower temperature for more consistent output
      responseFormat: "json_object",
    };

    const response = await provider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = JSON.parse(response.content);
    const relations = parsed.relations || [];

    // Validate and filter relations
    return relations.filter((rel: any) => {
      // Validate indices are within range
      if (
        typeof rel.from_index !== "number" ||
        typeof rel.to_index !== "number" ||
        rel.from_index < 1 ||
        rel.from_index > facts.length ||
        rel.to_index < 1 ||
        rel.to_index > facts.length ||
        rel.from_index === rel.to_index
      ) {
        console.warn(`Invalid relation indices: from=${rel.from_index}, to=${rel.to_index}, max=${facts.length}`);
        return false;
      }

      // Validate relation type
      if (!VALID_RELATION_TYPES.includes(rel.type)) {
        console.warn(`Invalid relation type: ${rel.type}, using "related_to"`);
        rel.type = "related_to"; // Fallback to generic type
      }

      return true;
    });
  }

  private async groupRelatedFacts(facts: any[]): Promise<any[][]> {
    // Group facts by their relationships
    const clusters: any[][] = [];
    const processed = new Set<string>();

    for (const fact of facts) {
      if (processed.has(fact._id || fact.id)) {
        continue;
      }

      const cluster = await this.getRelatedFacts([fact]);
      for (const f of cluster) {
        processed.add(f._id || f.id);
      }
      clusters.push(cluster);
    }

    return clusters;
  }

  private async consolidateCluster(facts: any[]): Promise<any | null> {
    if (facts.length === 0) {
      return null;
    }

    // Ensure all facts belong to the same workspace
    const workspaceIds = new Set(facts.map((f) => f.workspace_id).filter(Boolean));
    if (workspaceIds.size === 0) {
      console.warn("Skipping cluster: no facts have workspace_id");
      return null;
    }
    if (workspaceIds.size > 1) {
      console.warn(
        `Skipping cluster: facts belong to multiple workspaces: ${Array.from(workspaceIds).join(", ")}`,
      );
      return null;
    }

    const workspaceId = Array.from(workspaceIds)[0];

    console.log(
      `Consolidating ${facts.length} related facts for workspace ${workspaceId}`,
    );

    // Prepare content for AI
    const factContents = facts.map((f) => `- ${f.content}`).join("\n");

    // Use AI agent to consolidate
    const consolidation = await this.consolidateWithAI(factContents, facts);

    // Create knowledge card
    const knowledgeCard = await KnowledgeCard.create({
      title: consolidation.title,
      summary: consolidation.summary,
      content: consolidation.content,
      fact_ids: facts.map((f) => f._id || f.id),
      workspace_id: workspaceId,
      created_by: "system",
      last_updated_by: "system",
            created_by_worker: "card-consolidator",
            last_updated_by_worker: "card-consolidator",
    });

    console.log(`Created knowledge card: ${knowledgeCard.id}`);
    return knowledgeCard;
  }

  private async getRelatedFacts(seedFacts: any[]): Promise<any[]> {
    // Ensure all seed facts belong to the same workspace
    const seedWorkspaceIds = new Set(
      seedFacts.map((f) => f.workspace_id).filter(Boolean),
    );
    if (seedWorkspaceIds.size === 0) {
      return seedFacts; // No workspace_id, return as-is
    }
    if (seedWorkspaceIds.size > 1) {
      console.warn(
        `Seed facts belong to multiple workspaces: ${Array.from(seedWorkspaceIds).join(", ")}. Using first workspace.`,
      );
    }
    const workspaceId = Array.from(seedWorkspaceIds)[0];

    // Use graph traversal to find related facts via FactRelations
    const factIds = seedFacts.map((f) => f._id || f.id);
    const allRelated: Set<string> = new Set(factIds);

    for (const fact of seedFacts) {
      const factId = fact._id || fact.id;
      const outgoing = await FactRelation.getRelatedFacts(factId);
      const incoming = await FactRelation.getIncomingRelations(factId);

      // Filter relations to only include facts from the same workspace
      for (const rel of outgoing) {
        if (rel.fact.workspace_id === workspaceId) {
          allRelated.add(rel.fact._id || rel.fact.id);
        }
      }
      for (const rel of incoming) {
        if (rel.fact.workspace_id === workspaceId) {
          allRelated.add(rel.fact._id || rel.fact.id);
        }
      }
    }

    // Fetch all related facts
    const relatedFacts: any[] = [];
    for (const factId of allRelated) {
      const fact = await Fact.findById(factId);
      if (fact && !fact.trashed && fact.workspace_id === workspaceId) {
        relatedFacts.push(fact);
      }
    }

    return relatedFacts;
  }

  private async consolidateWithAI(
    factContents: string,
    facts: any[],
  ): Promise<{ title: string; summary: string; content: string }> {
    const systemPrompt = `You are a knowledge consolidation agent. Your task is to analyze a collection of related facts and their relationships (from a knowledge graph) and create a comprehensive, well-organized knowledge card.

Create a knowledge card with:
1. A clear, descriptive title (max 100 characters)
2. A concise summary (2-3 sentences, max 200 characters)
3. A comprehensive content section that organizes and synthesizes the information

The content should:
- Group related information logically
- Highlight key relationships and connections between facts
- Remove redundancy while preserving important details
- Be well-structured and easy to read
- Reflect the graph structure and relationships between facts`;

    const userPrompt = `Please consolidate the following facts (and their relationships) into a knowledge card:

${factContents}

Consider the relationships between these facts when consolidating. Provide your response as JSON with the following structure:
{
  "title": "Knowledge card title",
  "summary": "Brief summary",
  "content": "Full consolidated content"
}`;

    const provider = this.aiClient.getProvider();
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const chatOptions: ChatCompletionOptions = {
      model: getChatModel(),
      temperature: 0.7,
      responseFormat: "json_object",
    };

    const response = await provider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = JSON.parse(response.content);
    return {
      title: parsed.title || "Untitled Card",
      summary: parsed.summary || "",
      content: parsed.content || "",
    };
  }
}
