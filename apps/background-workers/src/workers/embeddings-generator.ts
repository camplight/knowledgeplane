import { Fact, FactRelation, KnowledgeCard, WorkerLog, Workspace, collections, ensureVectorIndex } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";
import PQueue from "p-queue";

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

  // Throttled queue for real-time embedding generation
  private queue: PQueue;
  private processedIds = new Set<string>(); // Prevent duplicate processing

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required for embeddings");
    }
    // Use OpenAI for embeddings (Anthropic doesn't support embeddings)
    this.aiClient = createAIModelClient("openai", apiKey);
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

    // Initialize throttled queue
    // OpenAI rate limits: 3,000 RPM for text-embedding-3-small
    // Set to 200 requests/minute for benchmarks (= 1 request every 300ms)
    // Still well under the 3000 RPM limit (16.7x safety margin)
    this.queue = new PQueue({
      concurrency: 1, // Process one at a time to avoid rate limits
      interval: 300, // 300ms between requests (200 req/min)
      intervalCap: 1, // 1 request per interval
    });

    console.log("Embeddings generator initialized with throttled queue (200 req/min)");
  }

  /**
   * Enqueue a fact, relation, or card for embedding generation
   * Call this immediately after creating/updating items
   */
  async enqueueFact(workspaceId: string, factId: string): Promise<void> {
    const key = `fact:${workspaceId}:${factId}`;
    if (this.processedIds.has(key)) {
      return; // Already processing or processed
    }

    this.processedIds.add(key);
    await this.queue.add(async () => {
      try {
        await this.processSingleFact(workspaceId, factId);
      } finally {
        // Remove from processed set after some time to allow reprocessing if needed
        setTimeout(() => this.processedIds.delete(key), 60000); // 1 minute
      }
    });
  }

  async enqueueRelation(workspaceId: string, relationId: string): Promise<void> {
    const key = `relation:${workspaceId}:${relationId}`;
    if (this.processedIds.has(key)) {
      return;
    }

    this.processedIds.add(key);
    await this.queue.add(async () => {
      try {
        await this.processSingleRelation(workspaceId, relationId);
      } finally {
        setTimeout(() => this.processedIds.delete(key), 60000);
      }
    });
  }

  async enqueueCard(workspaceId: string, cardId: string): Promise<void> {
    const key = `card:${workspaceId}:${cardId}`;
    if (this.processedIds.has(key)) {
      return;
    }

    this.processedIds.add(key);
    await this.queue.add(async () => {
      try {
        await this.processSingleCard(workspaceId, cardId);
      } finally {
        setTimeout(() => this.processedIds.delete(key), 60000);
      }
    });
  }

  start() {
    console.log("Embeddings generator started with real-time queue processing");

    // Keep periodic sweep every 10 minutes as backup for missed items
    this.interval = setInterval(() => {
      console.log("Running periodic sweep for missed embeddings...");
      this.process().catch((error) => {
        console.error("Error in periodic embeddings sweep:", error);
      });
    }, 10 * 60 * 1000);

    // Check for manual triggers every 5 seconds (reduced for faster benchmark response)
    this.triggerCheckInterval = setInterval(() => {
      this.checkAndProcessTrigger().catch((error) => {
        console.error("Error checking for triggers:", error);
      });
    }, 5 * 1000);

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
    try {
      // Check for pending triggers for this worker (batch process up to 10)
      const aql = `
        FOR trigger IN worker_triggers
          FILTER trigger.worker_name == "embeddings-generator"
          FILTER trigger.status == "pending"
          SORT trigger.created_at ASC
          LIMIT 10
          RETURN trigger
      `;

      const cursor = await collections.worker_triggers.database.query(aql);
      const triggers = await cursor.all();

      if (triggers.length === 0) {
        return; // No pending triggers
      }

      console.log(`Processing ${triggers.length} embedding trigger(s)...`);

      for (const trigger of triggers) {
        const triggerId = trigger._id || `worker_triggers/${trigger._key}`;
        const triggerKey = trigger._key;

        try {
          // Mark trigger as processing
          await collections.worker_triggers.update(triggerKey, {
            status: "processing",
            updated_at: new Date().toISOString(),
          });

          // Check if this is a single-item trigger (from real-time queue)
          const metadata = trigger.metadata || {};
          if (metadata.type === "fact" && metadata.id) {
            // Process single fact via queue (rate-limited)
            await this.enqueueFact(metadata.workspace_id || "", metadata.id);
            console.log(`Queued fact ${metadata.id} for embedding generation`);
          } else if (metadata.type === "relation" && metadata.id) {
            await this.enqueueRelation(metadata.workspace_id || "", metadata.id);
            console.log(`Queued relation ${metadata.id} for embedding generation`);
          } else if (metadata.type === "card" && metadata.id) {
            await this.enqueueCard(metadata.workspace_id || "", metadata.id);
            console.log(`Queued card ${metadata.id} for embedding generation`);
          } else {
            // Legacy/bulk trigger - run full sweep (only if not already running)
            if (!this.running) {
              await this.process();
            }
          }

          // Mark trigger as completed
          await collections.worker_triggers.update(triggerKey, {
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (error: any) {
          console.error(`Error processing trigger ${triggerId}:`, error);
          await collections.worker_triggers.update(triggerKey, {
            status: "failed",
            error: error.message || String(error),
            updated_at: new Date().toISOString(),
          });
        }
      }
    } catch (error: any) {
      console.error("Error checking for triggers:", error);
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

  /**
   * Process a single fact for embeddings (real-time)
   */
  private async processSingleFact(workspaceId: string, factId: string): Promise<void> {
    try {
      // Extract key from ID if needed
      const key = factId.replace(/^facts\//, '');
      const fact = await collections.facts.document(key);

      // Check if embedding needed
      if (fact.embedding && fact.embedding_model === this.embeddingModel) {
        return; // Already has correct embedding
      }

      // Generate embedding
      const provider = this.aiClient.getProvider();
      const text = this.truncateToTokenLimit(fact.content);
      const result = await provider.embeddings([text], this.embeddingModel);

      // Update fact
      await collections.facts.update(key, {
        embedding: result.embeddings[0],
        embedding_model: this.embeddingModel,
      });

      console.log(`Generated embedding for fact ${factId} in real-time`);
    } catch (error: any) {
      console.error(`Error processing single fact ${factId}:`, error.message);
      throw error; // Re-throw to let queue handle retry
    }
  }

  /**
   * Process a single relation for embeddings (real-time)
   */
  private async processSingleRelation(workspaceId: string, relationId: string): Promise<void> {
    try {
      const key = relationId.replace(/^relations\//, '');
      const relation = await collections.relations.document(key);

      if (relation.embedding && relation.embedding_model === this.embeddingModel) {
        return;
      }

      const provider = this.aiClient.getProvider();
      const metadataStr = relation.metadata ? JSON.stringify(relation.metadata) : "";
      const text = this.truncateToTokenLimit(`${relation.type}${metadataStr ? ` ${metadataStr}` : ""}`);
      const result = await provider.embeddings([text], this.embeddingModel);

      await collections.relations.update(key, {
        embedding: result.embeddings[0],
        embedding_model: this.embeddingModel,
      });

      console.log(`Generated embedding for relation ${relationId} in real-time`);
    } catch (error: any) {
      console.error(`Error processing single relation ${relationId}:`, error.message);
      throw error;
    }
  }

  /**
   * Process a single knowledge card for embeddings (real-time)
   */
  private async processSingleCard(workspaceId: string, cardId: string): Promise<void> {
    try {
      const key = cardId.replace(/^knowledge_cards\//, '');
      const card = await collections.knowledge_cards.document(key);

      if (card.embedding && card.embedding_model === this.embeddingModel) {
        return;
      }

      const provider = this.aiClient.getProvider();
      const text = this.truncateToTokenLimit(`${card.title}\n${card.summary}\n${card.content}`);
      const result = await provider.embeddings([text], this.embeddingModel);

      await collections.knowledge_cards.update(key, {
        embedding: result.embeddings[0],
        embedding_model: this.embeddingModel,
        last_updated_by: "system",
        last_updated_by_worker: "embeddings-generator",
        updated_at: new Date().toISOString(),
      });

      console.log(`Generated embedding for card ${cardId} in real-time`);
    } catch (error: any) {
      console.error(`Error processing single card ${cardId}:`, error.message);
      throw error;
    }
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
          // Use full workspace ID (with "workspaces/" prefix) to match how facts are stored
          const workspaceId = workspace.id;
          console.log(`DEBUG: Processing workspace ${workspaceId}`);

          // Process facts without embeddings or with outdated embeddings for this workspace
          // Iterate through ALL facts using pagination
          const allFacts: any[] = [];
          const batchSize = 100;
          let offset = 0;
          let hasMore = true;

          while (hasMore) {
            const factsBatch = await Fact.list(workspaceId, batchSize, offset, false);
            if (factsBatch.length === 0) {
              hasMore = false;
            } else {
              allFacts.push(...factsBatch);
              offset += batchSize;
              // Safety limit: don't process more than 10,000 facts at once
              if (allFacts.length >= 10000) {
                console.log(`Reached safety limit of 10,000 facts for workspace ${workspace.id}`);
                hasMore = false;
              }
            }
          }

          console.log(`Fetched ${allFacts.length} total facts from workspace ${workspace.id}`);

          // Debug: log summary for benchmarking
          const factsWithEmbeddings = allFacts.filter(f => f.embedding && Array.isArray(f.embedding) && f.embedding.length === 1536);
          console.log(`[BENCHMARK] Facts summary:`, {
            total: allFacts.length,
            with_embeddings: factsWithEmbeddings.length,
            without_embeddings: allFacts.length - factsWithEmbeddings.length,
            workspace: workspace.id,
            timestamp: new Date().toISOString(),
          });

          const factsNeedingEmbeddings = allFacts.filter(
            (f) => !f.embedding || (Array.isArray(f.embedding) && f.embedding.length === 0) || f.embedding_model !== this.embeddingModel,
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
          // Iterate through ALL relations using pagination
          const allRelations: any[] = [];
          let relationOffset = 0;
          let hasMoreRelations = true;

          while (hasMoreRelations) {
            const relationsBatch = await FactRelation.query({ workspace_id: workspaceId, limit: 100, offset: relationOffset });
            if (relationsBatch.length === 0) {
              hasMoreRelations = false;
            } else {
              allRelations.push(...relationsBatch);
              relationOffset += 100;
              if (allRelations.length >= 10000) {
                console.log(`Reached safety limit of 10,000 relations for workspace ${workspace.id}`);
                hasMoreRelations = false;
              }
            }
          }

          console.log(`Fetched ${allRelations.length} total relations from workspace ${workspace.id}`);

          const relationsNeedingEmbeddings = allRelations.filter(
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
          // Iterate through ALL cards using pagination
          const allCards: any[] = [];
          let cardOffset = 0;
          let hasMoreCards = true;

          while (hasMoreCards) {
            const cardsBatch = await KnowledgeCard.list(workspaceId, 100, cardOffset);
            if (cardsBatch.length === 0) {
              hasMoreCards = false;
            } else {
              allCards.push(...cardsBatch);
              cardOffset += 100;
              if (allCards.length >= 10000) {
                console.log(`Reached safety limit of 10,000 cards for workspace ${workspace.id}`);
                hasMoreCards = false;
              }
            }
          }

          console.log(`Fetched ${allCards.length} total cards from workspace ${workspace.id}`);

          const cardsNeedingEmbeddings = allCards.filter(
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
                  last_updated_by: "system",
                  last_updated_by_worker: "embeddings-generator",
                  updated_at: new Date().toISOString(),
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

      // Ensure vector indexes exist (even if no new embeddings were generated this run)
      // NOTE: ArangoDB vector indexes block inserts on documents without embeddings.
      // Facts get embeddings immediately via sync_embedding, so vector index works.
      // Relations and knowledge_cards are created without embeddings (added later by this worker),
      // so we cannot create vector indexes on them until all docs have embeddings.
      console.log('Checking/creating vector indexes...');
      await ensureVectorIndex('facts');
      // Skip relations and knowledge_cards vector indexes for now
      // await ensureVectorIndex('relations');
      // await ensureVectorIndex('knowledge_cards');
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

