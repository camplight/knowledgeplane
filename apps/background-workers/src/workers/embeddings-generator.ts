import { Fact, FactRelation, KnowledgeCard, WorkerLog, collections } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";

export class EmbeddingsGenerator {
  private aiClient: ReturnType<typeof createAIModelClient>;
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  private embeddingModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required for embeddings");
    }
    // Use OpenAI for embeddings (Anthropic doesn't support embeddings)
    this.aiClient = createAIModelClient("openai", apiKey);
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  }

  start() {
    console.log("Embeddings generator started");
    // Run every 10 minutes
    this.interval = setInterval(() => {
      this.process().catch((error) => {
        console.error("Error in embeddings generation:", error);
      });
    }, 10 * 60 * 1000);

    // Run immediately on start
    this.process().catch((error) => {
      console.error("Error in initial embeddings generation:", error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log("Embeddings generator stopped");
  }

  private async process() {
    if (this.running) {
      return;
    }

    const startTime = Date.now();
    this.running = true;
    let factsProcessed = 0;
    let relationsProcessed = 0;
    let cardsProcessed = 0;
    let factsUpdated = 0;
    let relationsUpdated = 0;
    let cardsUpdated = 0;
    let error: string | undefined;

    try {
      const provider = this.aiClient.getProvider();

      // Process facts without embeddings or with outdated embeddings
      const facts = await Fact.list(100, 0, false);
      const factsNeedingEmbeddings = facts.filter(
        (f) => !f.embedding || f.embedding_model !== this.embeddingModel,
      );

      factsProcessed = factsNeedingEmbeddings.length;
      console.log(`Processing ${factsNeedingEmbeddings.length} facts for embeddings`);

      // Process facts in batches
      for (let i = 0; i < factsNeedingEmbeddings.length; i += 10) {
        const batch = factsNeedingEmbeddings.slice(i, i + 10);
        const texts = batch.map((f) => f.content);
        
        try {
          const result = await provider.embeddings(texts, this.embeddingModel);
          
          for (let j = 0; j < batch.length; j++) {
            const fact = batch[j];
            const embedding = result.embeddings[j];
            
            const key = Fact.extractKey(fact.id);
            await collections.facts.update(key, {
              embedding,
              embedding_model: this.embeddingModel,
            });
            factsUpdated++;
          }
        } catch (err: any) {
          console.error(`Error processing fact batch ${i}-${i + batch.length}:`, err.message);
        }
      }

      // Process fact relations
      const relations = await FactRelation.query({ limit: 100, offset: 0 });
      const relationsNeedingEmbeddings = relations.filter(
        (r) => !r.embedding || r.embedding_model !== this.embeddingModel,
      );

      relationsProcessed = relationsNeedingEmbeddings.length;
      console.log(`Processing ${relationsNeedingEmbeddings.length} relations for embeddings`);

      // Process relations in batches
      for (let i = 0; i < relationsNeedingEmbeddings.length; i += 10) {
        const batch = relationsNeedingEmbeddings.slice(i, i + 10);
        // Create text representation: type + metadata
        const texts = batch.map((r) => {
          const metadataStr = r.metadata ? JSON.stringify(r.metadata) : "";
          return `${r.type}${metadataStr ? ` ${metadataStr}` : ""}`;
        });
        
        try {
          const result = await provider.embeddings(texts, this.embeddingModel);
          
          for (let j = 0; j < batch.length; j++) {
            const relation = batch[j];
            const embedding = result.embeddings[j];
            
            const key = FactRelation.extractKey(relation.id);
            await collections.relations.update(key, {
              embedding,
              embedding_model: this.embeddingModel,
            });
            relationsUpdated++;
          }
        } catch (err: any) {
          console.error(`Error processing relation batch ${i}-${i + batch.length}:`, err.message);
        }
      }

      // Process knowledge cards
      const cards = await KnowledgeCard.list(100, 0);
      const cardsNeedingEmbeddings = cards.filter(
        (c) => !c.embedding || c.embedding_model !== this.embeddingModel,
      );

      cardsProcessed = cardsNeedingEmbeddings.length;
      console.log(`Processing ${cardsNeedingEmbeddings.length} cards for embeddings`);

      // Process cards in batches
      for (let i = 0; i < cardsNeedingEmbeddings.length; i += 10) {
        const batch = cardsNeedingEmbeddings.slice(i, i + 10);
        // Create text representation: title + summary + content
        const texts = batch.map((c) => `${c.title}\n${c.summary}\n${c.content}`);
        
        try {
          const result = await provider.embeddings(texts, this.embeddingModel);
          
          for (let j = 0; j < batch.length; j++) {
            const card = batch[j];
            const embedding = result.embeddings[j];
            
            const key = KnowledgeCard.extractKey(card.id);
            await collections.knowledge_cards.update(key, {
              embedding,
              embedding_model: this.embeddingModel,
            });
            cardsUpdated++;
          }
        } catch (err: any) {
          console.error(`Error processing card batch ${i}-${i + batch.length}:`, err.message);
        }
      }

      const executionTime = Date.now() - startTime;
      await WorkerLog.create({
        worker_name: "embeddings-generator",
        task_type: "embeddings",
        status: "success",
        message: `Generated embeddings for ${factsUpdated} facts, ${relationsUpdated} relations, ${cardsUpdated} cards`,
        execution_time_ms: executionTime,
        items_processed: factsProcessed + relationsProcessed + cardsProcessed,
        items_created: 0,
        items_updated: factsUpdated + relationsUpdated + cardsUpdated,
      });

      console.log(
        `Updated embeddings: ${factsUpdated} facts, ${relationsUpdated} relations, ${cardsUpdated} cards`,
      );
    } catch (err: any) {
      error = err.message || String(err);
      const executionTime = Date.now() - startTime;
      await WorkerLog.create({
        worker_name: "embeddings-generator",
        task_type: "embeddings",
        status: "error",
        message: "Embeddings generation failed",
        execution_time_ms: executionTime,
        items_processed: factsProcessed + relationsProcessed + cardsProcessed,
        items_created: 0,
        items_updated: factsUpdated + relationsUpdated + cardsUpdated,
        error: error,
      });
      throw err;
    } finally {
      this.running = false;
    }
  }
}

