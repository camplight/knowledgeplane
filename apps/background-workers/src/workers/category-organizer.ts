import { Card, Category, WorkerLog } from "@knowledgeplane/db";
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

    const startTime = Date.now();
    this.running = true;
    let categoriesCreated = 0;
    let cardsUpdated = 0;
    let cardsProcessed = 0;
    let error: string | undefined;

    try {
      // Get cards without categories
      const uncategorizedCards = await Card.list(100, 0);

      if (uncategorizedCards.length === 0) {
        await WorkerLog.create({
          worker_name: "category-organizer",
          task_type: "organization",
          status: "success",
          message: "No uncategorized cards found",
          execution_time_ms: Date.now() - startTime,
          items_processed: 0,
          items_created: 0,
        });
        return;
      }

      cardsProcessed = uncategorizedCards.length;
      console.log(`Processing ${uncategorizedCards.length} uncategorized cards`);

      // Use AI to suggest category structure
      const categoryStructure = await this.suggestCategoryStructure(
        uncategorizedCards,
      );

      // Create/update categories and assign cards
      const result = await this.applyCategoryStructure(
        categoryStructure,
        uncategorizedCards,
      );

      categoriesCreated = result.categoriesCreated;
      cardsUpdated = result.cardsUpdated;

      const executionTime = Date.now() - startTime;
      await WorkerLog.create({
        worker_name: "category-organizer",
        task_type: "organization",
        status: "success",
        message: `Organized ${cardsProcessed} cards into ${categoriesCreated} categories`,
        execution_time_ms: executionTime,
        items_processed: cardsProcessed,
        items_created: categoriesCreated,
        items_updated: cardsUpdated,
      });

      console.log(`Created ${categoriesCreated} categories, updated ${cardsUpdated} cards`);
    } catch (err: any) {
      error = err.message || String(err);
      const executionTime = Date.now() - startTime;
      await WorkerLog.create({
        worker_name: "category-organizer",
        task_type: "organization",
        status: "error",
        message: "Category organization failed",
        execution_time_ms: executionTime,
        items_processed: cardsProcessed,
        items_created: categoriesCreated,
        items_updated: cardsUpdated,
        error: error,
      });
      throw err;
    } finally {
      this.running = false;
    }
  }

  private async suggestCategoryStructure(
    cards: any[],
  ): Promise<any> {
    const cardTitles = cards.map((c) => c.title).join("\n- ");

    // Get existing categories
    const existingCategories = await Category.list();

    const systemPrompt = `You are a knowledge organization agent. Your task is to suggest a hierarchical category structure for organizing knowledge cards.

Existing categories:
${existingCategories.length > 0 ? existingCategories.map((c) => `- ${c.name}`).join("\n") : "None"}

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
      model: process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || "gpt-4o",
      temperature: 0.7,
      responseFormat: "json_object",
    };

    const response = await provider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = JSON.parse(response.content);
    return parsed.categories || [];
  }

  private async applyCategoryStructure(
    categoryStructure: any[],
    cards: any[],
  ): Promise<{ categoriesCreated: number; cardsUpdated: number }> {
    const categoryMap = new Map<string, string>(); // name -> id
    let categoriesCreated = 0;
    let cardsUpdated = 0;

    // Get existing categories
    const existingCategories = await Category.list();
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
          created_by: "system",
        });

        categoryId = category.id;
        categoryMap.set(catData.name, categoryId);
        categoriesCreated++;
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
            cardsUpdated++;
          }
        }
      }
    }

    return { categoriesCreated, cardsUpdated };
  }
}
