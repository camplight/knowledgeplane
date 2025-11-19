import { Fact, KnowledgeCard, FactRelation, WorkerLog } from "@knowledgeplane/db";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";

export class CardConsolidator {
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
    console.log("Card consolidator started");
    // Run every 5 minutes
    this.interval = setInterval(() => {
      this.process().catch((error) => {
        console.error("Error in card consolidation:", error);
      });
    }, 5 * 60 * 1000);

    // Run immediately on start
    this.process().catch((error) => {
      console.error("Error in initial card consolidation:", error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log("Card consolidator stopped");
  }

  private async process() {
    if (this.running) {
      return; // Skip if already running
    }

    const startTime = Date.now();
    this.running = true;
    let cardsCreated = 0;
    let factsProcessed = 0;
    let error: string | undefined;

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

    // Group facts by related clusters using graph traversal
    const factClusters = await this.groupRelatedFacts(facts);

    for (const cluster of factClusters) {
      const knowledgeCard = await this.consolidateCluster(cluster);
      if (knowledgeCard) {
        cardsCreated++;
      }
    }

    const executionTime = Date.now() - startTime;
    await WorkerLog.create({
      worker_name: "card-consolidator",
      task_type: "consolidation",
      status: "success",
      message: `Consolidated ${factsProcessed} facts into ${cardsCreated} knowledge cards`,
      execution_time_ms: executionTime,
      items_processed: factsProcessed,
      items_created: cardsCreated,
    });

    console.log(`Created ${cardsCreated} knowledge cards from ${factsProcessed} facts`);
    } catch (err: any) {
      error = err.message || String(err);
      const executionTime = Date.now() - startTime;
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
      throw err;
    } finally {
      this.running = false;
    }
  }

  private async getUnconsolidatedFacts(): Promise<any[]> {
    // Get facts that are not in any knowledge card's fact_ids
    const aql = `
      FOR fact IN facts
        FILTER fact.trashed == false
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

    console.log(`Consolidating ${facts.length} related facts`);

    // Prepare content for AI
    const factContents = facts
      .map((f) => `- ${f.content}`)
      .join("\n");

    // Use AI agent to consolidate
    const consolidation = await this.consolidateWithAI(
      factContents,
      facts,
    );

    // Create knowledge card
    const knowledgeCard = await KnowledgeCard.create({
      title: consolidation.title,
      summary: consolidation.summary,
      content: consolidation.content,
      fact_ids: facts.map((f) => f._id || f.id),
      created_by: "system",
      last_updated_by: "system",
    });

    console.log(`Created knowledge card: ${knowledgeCard.id}`);
    return knowledgeCard;
  }

  private async getRelatedFacts(seedFacts: any[]): Promise<any[]> {
    // Use graph traversal to find related facts via FactRelations
    const factIds = seedFacts.map((f) => f._id || f.id);
    const allRelated: Set<string> = new Set(factIds);

    for (const fact of seedFacts) {
      const factId = fact._id || fact.id;
      const outgoing = await FactRelation.getRelatedFacts(factId);
      const incoming = await FactRelation.getIncomingRelations(factId);

      for (const rel of outgoing) {
        allRelated.add(rel.fact._id || rel.fact.id);
      }
      for (const rel of incoming) {
        allRelated.add(rel.fact._id || rel.fact.id);
      }
    }

    // Fetch all related facts
    const relatedFacts: any[] = [];
    for (const factId of allRelated) {
      const fact = await Fact.findById(factId);
      if (fact && !fact.trashed) {
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
      model: process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || "gpt-4o",
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
