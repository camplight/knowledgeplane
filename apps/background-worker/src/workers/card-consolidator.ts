import { Fact, Card, Relation } from "@knowledgeplane/db";
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
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

    this.running = true;
    try {
      // Get facts that haven't been consolidated into cards
      const facts = await this.getUnconsolidatedFacts();

      if (facts.length === 0) {
        console.log("No unconsolidated facts found");
        return;
      }

      console.log(`Processing ${facts.length} unconsolidated facts`);

      // Group facts by knowledge context
      const factsByContext = this.groupByContext(facts);

      for (const [context, contextFacts] of Object.entries(factsByContext)) {
        await this.consolidateContext(context, contextFacts);
      }
    } finally {
      this.running = false;
    }
  }

  private async getUnconsolidatedFacts(): Promise<any[]> {
    // Get facts that are not in any card's fact_ids
    const aql = `
      FOR fact IN facts
        FILTER fact.trashed == false
        LET inCard = (
          FOR card IN cards
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

  private groupByContext(facts: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    for (const fact of facts) {
      const context = fact.knowledge_context || "default";
      if (!grouped[context]) {
        grouped[context] = [];
      }
      grouped[context].push(fact);
    }
    return grouped;
  }

  private async consolidateContext(
    context: string,
    facts: any[],
  ): Promise<void> {
    console.log(`Consolidating ${facts.length} facts for context: ${context}`);

    // Get related facts using graph traversal
    const relatedFacts = await this.getRelatedFacts(facts);

    // Prepare content for OpenAI
    const factContents = relatedFacts
      .map((f) => `- ${f.content}`)
      .join("\n");

    // Use OpenAI agent to consolidate
    const consolidation = await this.consolidateWithOpenAI(
      context,
      factContents,
      relatedFacts,
    );

    // Create or update card
    const card = await this.createOrUpdateCard(
      context,
      consolidation,
      relatedFacts.map((f) => f._id || f.id),
    );

    console.log(`Created/updated card: ${card.id}`);
  }

  private async getRelatedFacts(facts: any[]): Promise<any[]> {
    // Use graph traversal to find related facts
    const factIds = facts.map((f) => f._id || f.id);
    const allRelated: Set<string> = new Set(factIds);

    for (const fact of facts) {
      const factId = fact._id || fact.id;
      const outgoing = await Relation.getRelatedFacts(factId);
      const incoming = await Relation.getIncomingRelations(factId);

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

  private async consolidateWithOpenAI(
    context: string,
    factContents: string,
    facts: any[],
  ): Promise<{ title: string; summary: string; content: string }> {
    const systemPrompt = `You are a knowledge consolidation agent. Your task is to analyze a collection of related facts and create a comprehensive, well-organized summary card.

The facts are from the knowledge context: "${context}"

Create a card with:
1. A clear, descriptive title (max 100 characters)
2. A concise summary (2-3 sentences, max 200 characters)
3. A comprehensive content section that organizes and synthesizes the information

The content should:
- Group related information logically
- Highlight key relationships and connections
- Remove redundancy while preserving important details
- Be well-structured and easy to read`;

    const userPrompt = `Please consolidate the following facts into a card:

${factContents}

Provide your response as JSON with the following structure:
{
  "title": "Card title",
  "summary": "Brief summary",
  "content": "Full consolidated content"
}`;

    const provider = this.aiClient.getProvider();
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const chatOptions: ChatCompletionOptions = {
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: 0.7,
      responseFormat: "json_object",
    };

    const response = await provider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const content = response.content;

    const parsed = JSON.parse(content);
    return {
      title: parsed.title || "Untitled Card",
      summary: parsed.summary || "",
      content: parsed.content || "",
    };
  }

  private async createOrUpdateCard(
    context: string,
    consolidation: { title: string; summary: string; content: string },
    factIds: string[],
  ): Promise<any> {
    // Check if card exists for this context
    const existingCards = await Card.list(10, 0, context);

    // For now, create a new card. In the future, we could update existing cards
    // or merge related cards
    const card = await Card.create({
      title: consolidation.title,
      summary: consolidation.summary,
      content: consolidation.content,
      fact_ids: factIds,
      knowledge_context: context,
      created_by: "system", // System user
      last_updated_by: "system",
    });

    return card;
  }
}

