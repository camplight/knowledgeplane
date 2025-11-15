import { Card, Category } from "@knowledgeplane/db";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";

export class CategoryOrganizer {
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
    console.log("Category organizer started");
    // Run every 30 minutes
    this.interval = setInterval(() => {
      this.process().catch((error) => {
        console.error("Error in category organization:", error);
      });
    }, 30 * 60 * 1000);

    // Run immediately on start
    this.process().catch((error) => {
      console.error("Error in initial category organization:", error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log("Category organizer stopped");
  }

  private async process() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      // Get cards without categories
      const uncategorizedCards = await Card.list(100, 0);

      if (uncategorizedCards.length === 0) {
        console.log("No uncategorized cards found");
        return;
      }

      console.log(`Processing ${uncategorizedCards.length} uncategorized cards`);

      // Group cards by knowledge context
      const cardsByContext = this.groupByContext(uncategorizedCards);

      for (const [context, cards] of Object.entries(cardsByContext)) {
        await this.organizeContext(context, cards);
      }
    } finally {
      this.running = false;
    }
  }

  private groupByContext(cards: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    for (const card of cards) {
      const context = card.knowledge_context || "default";
      if (!grouped[context]) {
        grouped[context] = [];
      }
      grouped[context].push(card);
    }
    return grouped;
  }

  private async organizeContext(
    context: string,
    cards: any[],
  ): Promise<void> {
    console.log(`Organizing ${cards.length} cards for context: ${context}`);

    // Get existing categories for this context
    const existingCategories = await Category.list(context);

    // Use OpenAI to suggest category structure
    const categoryStructure = await this.suggestCategoryStructure(
      context,
      cards,
      existingCategories,
    );

    // Create/update categories and assign cards
    await this.applyCategoryStructure(
      context,
      categoryStructure,
      cards,
      existingCategories,
    );
  }

  private async suggestCategoryStructure(
    context: string,
    cards: any[],
    existingCategories: any[],
  ): Promise<any> {
    const cardTitles = cards.map((c) => c.title).join("\n- ");

    const systemPrompt = `You are a knowledge organization agent. Your task is to suggest a hierarchical category structure for organizing knowledge cards.

The cards are from the knowledge context: "${context}"

Existing categories:
${existingCategories.map((c) => `- ${c.name}`).join("\n")}

Create a meaningful category tree that groups related cards together. Categories should be:
- Clear and descriptive
- Hierarchical (parent-child relationships)
- Not too deep (max 3 levels)
- Not too broad or too narrow

Provide your response as JSON with the following structure:
{
  "categories": [
    {
      "name": "Category name",
      "description": "Category description",
      "parent": "Parent category name or null",
      "cardTitles": ["Card title 1", "Card title 2"]
    }
  ]
}`;

    const userPrompt = `Please suggest a category structure for these cards:

${cardTitles}`;

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
    return parsed.categories || [];
  }

  private async applyCategoryStructure(
    context: string,
    categoryStructure: any[],
    cards: any[],
    existingCategories: any[],
  ): Promise<void> {
    const categoryMap = new Map<string, string>(); // name -> id

    // Create category name to existing category map
    for (const cat of existingCategories) {
      categoryMap.set(cat.name, cat.id);
    }

    // Create/update categories
    for (const catData of categoryStructure) {
      let categoryId = categoryMap.get(catData.name);

      if (!categoryId) {
        // Create new category
        const parentId = catData.parent
          ? categoryMap.get(catData.parent)
          : undefined;

        const category = await Category.create({
          name: catData.name,
          description: catData.description || "",
          parent_id: parentId,
          knowledge_context: context,
          created_by: "system",
        });

        categoryId = category.id;
        categoryMap.set(catData.name, categoryId);
      }

      // Assign cards to category
      if (catData.cardTitles && Array.isArray(catData.cardTitles)) {
        for (const cardTitle of catData.cardTitles) {
          const card = cards.find((c) => c.title === cardTitle);
          if (card && !card.category_id) {
            await Card.update({
              id: card.id,
              category_id: categoryId,
              last_updated_by: "system",
            });
          }
        }
      }
    }
  }
}

