import { Fact, FactRelation, KnowledgeCard, WorkerLog, Workspace, collections } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";

export class EmbeddingsGenerator {
  private aiClient: ReturnType<typeof createAIModelClient>;
  private interval: NodeJS.Timeout | null = null;
  private triggerCheckInterval: NodeJS.Timeout | null = null;
  private running = false;
  private embeddingModel: string;
  // OpenAI embeddings API limit: 300,000 tokens per request
  private readonly MAX_TOKENS_PER_BATCH = 300000;
  // Conservative token estimation: ~3 characters per token (slightly overestimate to be safe)
  private readonly CHARS_PER_TOKEN = 3;

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

    // Check for manual triggers every 30 seconds
    this.triggerCheckInterval = setInterval(() => {
      this.checkAndProcessTrigger().catch((error) => {
        console.error("Error checking for triggers:", error);
      });
    }, 30 * 1000);

    // Run immediately on start
    this.process().catch((error) => {
      console.error("Error in initial embeddings generation:", error);
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
    console.log("Embeddings generator stopped");
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
          FILTER trigger.worker_name == "embeddings-generator"
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

      console.log(`Manual trigger detected for embeddings-generator (trigger ID: ${triggerId})`);

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
            FILTER trigger.worker_name == "embeddings-generator"
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

  /**
   * Estimate token count for a text string
   * Uses a conservative approximation: ~3 characters per token
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Truncate text to fit within token limit if needed
   * Returns the truncated text and logs a warning if truncation occurred
   */
  private truncateToTokenLimit(text: string, maxTokens: number = this.MAX_TOKENS_PER_BATCH): string {
    const tokens = this.estimateTokens(text);
    if (tokens <= maxTokens) {
      return text;
    }
    // Truncate to fit within limit (with some margin for safety)
    const maxChars = (maxTokens - 100) * this.CHARS_PER_TOKEN;
    const truncated = text.substring(0, maxChars);
    console.warn(
      `Text exceeds token limit (${tokens} tokens), truncating from ${text.length} to ${truncated.length} characters`,
    );
    return truncated;
  }

  /**
   * Create batches of items based on token count rather than item count
   * Ensures each batch stays under MAX_TOKENS_PER_BATCH
   */
  private createTokenAwareBatches<T>(
    items: T[],
    getText: (item: T) => string,
  ): T[][] {
    const batches: T[][] = [];
    let currentBatch: T[] = [];
    let currentBatchTokens = 0;

    for (const item of items) {
      const text = getText(item);
      // Use truncated text for token estimation to match what we'll actually send
      const truncatedText = this.truncateToTokenLimit(text);
      const itemTokens = this.estimateTokens(truncatedText);

      // If adding this item would exceed the limit, start a new batch
      if (currentBatchTokens + itemTokens > this.MAX_TOKENS_PER_BATCH && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchTokens = 0;
      }

      // If a single item exceeds the limit, it will be in its own batch
      // (truncation already handled in truncateToTokenLimit)
      currentBatch.push(item);
      currentBatchTokens += itemTokens;
    }

    // Add the last batch if it has items
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async process() {
    if (this.running) {
      return;
    }

    const startTime = Date.now();
    this.running = true;
    let totalFactsUpdated = 0;
    let totalRelationsUpdated = 0;
    let totalCardsUpdated = 0;
    let error: string | undefined;

    try {
      const provider = this.aiClient.getProvider();

      // Get all workspaces to process embeddings per workspace
      const workspaces = await Workspace.list(1000, 0);
      console.log(`Processing embeddings for ${workspaces.length} workspaces`);

      for (const workspace of workspaces) {
        const workspaceStartTime = Date.now();
        let workspaceFactsUpdated = 0;
        let workspaceRelationsUpdated = 0;
        let workspaceCardsUpdated = 0;

        try {
          // Process facts without embeddings or with outdated embeddings for this workspace
          const facts = await Fact.list(workspace.id, 100, 0, false);
          const factsNeedingEmbeddings = facts.filter(
            (f) => !f.embedding || f.embedding_model !== this.embeddingModel,
          );

          console.log(`Processing ${factsNeedingEmbeddings.length} facts for workspace ${workspace.id}`);

          // Process facts in token-aware batches
          const factBatches = this.createTokenAwareBatches(
            factsNeedingEmbeddings,
            (f) => f.content,
          );

          for (let batchIdx = 0; batchIdx < factBatches.length; batchIdx++) {
            const batch = factBatches[batchIdx];
            // Truncate texts to fit within token limits
            const texts = batch.map((f) => this.truncateToTokenLimit(f.content));
            
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
                workspaceFactsUpdated++;
              }
            } catch (err: any) {
              const startIdx = batchIdx > 0 
                ? factBatches.slice(0, batchIdx).reduce((sum, b) => sum + b.length, 0)
                : 0;
              console.error(`Error processing fact batch ${startIdx}-${startIdx + batch.length}:`, err.message);
            }
          }

          // Process fact relations for this workspace
          const relations = await FactRelation.query({ workspace_id: workspace.id, limit: 100, offset: 0 });
          const relationsNeedingEmbeddings = relations.filter(
            (r) => !r.embedding || r.embedding_model !== this.embeddingModel,
          );

          console.log(`Processing ${relationsNeedingEmbeddings.length} relations for workspace ${workspace.id}`);

          // Process relations in token-aware batches
          const relationBatches = this.createTokenAwareBatches(
            relationsNeedingEmbeddings,
            (r) => {
              const metadataStr = r.metadata ? JSON.stringify(r.metadata) : "";
              return `${r.type}${metadataStr ? ` ${metadataStr}` : ""}`;
            },
          );

          for (let batchIdx = 0; batchIdx < relationBatches.length; batchIdx++) {
            const batch = relationBatches[batchIdx];
            // Create text representation: type + metadata, and truncate if needed
            const texts = batch.map((r) => {
              const metadataStr = r.metadata ? JSON.stringify(r.metadata) : "";
              const text = `${r.type}${metadataStr ? ` ${metadataStr}` : ""}`;
              return this.truncateToTokenLimit(text);
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
                workspaceRelationsUpdated++;
              }
            } catch (err: any) {
              const startIdx = batchIdx > 0 
                ? relationBatches.slice(0, batchIdx).reduce((sum, b) => sum + b.length, 0)
                : 0;
              console.error(`Error processing relation batch ${startIdx}-${startIdx + batch.length}:`, err.message);
            }
          }

          // Process knowledge cards for this workspace
          const cards = await KnowledgeCard.list(workspace.id, 100, 0);
          const cardsNeedingEmbeddings = cards.filter(
            (c) => !c.embedding || c.embedding_model !== this.embeddingModel,
          );

          console.log(`Processing ${cardsNeedingEmbeddings.length} cards for workspace ${workspace.id}`);

          // Process cards in token-aware batches
          const cardBatches = this.createTokenAwareBatches(
            cardsNeedingEmbeddings,
            (c) => `${c.title}\n${c.summary}\n${c.content}`,
          );

          for (let batchIdx = 0; batchIdx < cardBatches.length; batchIdx++) {
            const batch = cardBatches[batchIdx];
            // Create text representation: title + summary + content, and truncate if needed
            const texts = batch.map((c) => {
              const text = `${c.title}\n${c.summary}\n${c.content}`;
              return this.truncateToTokenLimit(text);
            });
            
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
                workspaceCardsUpdated++;
              }
            } catch (err: any) {
              const startIdx = batchIdx > 0 
                ? cardBatches.slice(0, batchIdx).reduce((sum, b) => sum + b.length, 0)
                : 0;
              console.error(`Error processing card batch ${startIdx}-${startIdx + batch.length}:`, err.message);
            }
          }

          // Create log entry for this workspace
          const workspaceExecutionTime = Date.now() - workspaceStartTime;
          await WorkerLog.create({
            worker_name: "embeddings-generator",
            task_type: "embeddings",
            workspace_id: workspace.id,
            status: "success",
            message: `Generated embeddings for ${workspaceFactsUpdated} facts, ${workspaceRelationsUpdated} relations, ${workspaceCardsUpdated} cards`,
            execution_time_ms: workspaceExecutionTime,
            items_processed: factsNeedingEmbeddings.length + relationsNeedingEmbeddings.length + cardsNeedingEmbeddings.length,
            items_created: 0,
            items_updated: workspaceFactsUpdated + workspaceRelationsUpdated + workspaceCardsUpdated,
          });

          totalFactsUpdated += workspaceFactsUpdated;
          totalRelationsUpdated += workspaceRelationsUpdated;
          totalCardsUpdated += workspaceCardsUpdated;

          console.log(
            `Workspace ${workspace.id}: Updated embeddings for ${workspaceFactsUpdated} facts, ${workspaceRelationsUpdated} relations, ${workspaceCardsUpdated} cards`,
          );
        } catch (workspaceError: any) {
          console.error(`Error processing workspace ${workspace.id}:`, workspaceError);
          // Create error log for this workspace
          const workspaceExecutionTime = Date.now() - workspaceStartTime;
          await WorkerLog.create({
            worker_name: "embeddings-generator",
            task_type: "embeddings",
            workspace_id: workspace.id,
            status: "error",
            message: "Embeddings generation failed for workspace",
            execution_time_ms: workspaceExecutionTime,
            error: workspaceError.message || String(workspaceError),
          });
        }
      }

      const executionTime = Date.now() - startTime;
      console.log(
        `Total: Updated embeddings for ${totalFactsUpdated} facts, ${totalRelationsUpdated} relations, ${totalCardsUpdated} cards`,
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
        items_processed: 0,
        items_created: 0,
        items_updated: totalFactsUpdated + totalRelationsUpdated + totalCardsUpdated,
        error: error,
      });
      throw err;
    } finally {
      this.running = false;
    }
  }
}

