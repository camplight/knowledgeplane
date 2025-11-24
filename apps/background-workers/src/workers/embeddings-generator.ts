import { Fact, FactRelation, KnowledgeCard, WorkerLog, Team, collections } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";

export class EmbeddingsGenerator {
  private aiClient: ReturnType<typeof createAIModelClient>;
  private interval: NodeJS.Timeout | null = null;
  private triggerCheckInterval: NodeJS.Timeout | null = null;
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

      // Get all teams to process embeddings per team
      const teams = await Team.list(1000, 0);
      console.log(`Processing embeddings for ${teams.length} teams`);

      for (const team of teams) {
        const teamStartTime = Date.now();
        let teamFactsUpdated = 0;
        let teamRelationsUpdated = 0;
        let teamCardsUpdated = 0;

        try {
          // Process facts without embeddings or with outdated embeddings for this team
          const facts = await Fact.list(team.id, 100, 0, false);
          const factsNeedingEmbeddings = facts.filter(
            (f) => !f.embedding || f.embedding_model !== this.embeddingModel,
          );

          console.log(`Processing ${factsNeedingEmbeddings.length} facts for team ${team.id}`);

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
                teamFactsUpdated++;
              }
            } catch (err: any) {
              console.error(`Error processing fact batch ${i}-${i + batch.length}:`, err.message);
            }
          }

          // Process fact relations for this team
          const relations = await FactRelation.query({ team_id: team.id, limit: 100, offset: 0 });
          const relationsNeedingEmbeddings = relations.filter(
            (r) => !r.embedding || r.embedding_model !== this.embeddingModel,
          );

          console.log(`Processing ${relationsNeedingEmbeddings.length} relations for team ${team.id}`);

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
                teamRelationsUpdated++;
              }
            } catch (err: any) {
              console.error(`Error processing relation batch ${i}-${i + batch.length}:`, err.message);
            }
          }

          // Process knowledge cards for this team
          const cards = await KnowledgeCard.list(team.id, 100, 0);
          const cardsNeedingEmbeddings = cards.filter(
            (c) => !c.embedding || c.embedding_model !== this.embeddingModel,
          );

          console.log(`Processing ${cardsNeedingEmbeddings.length} cards for team ${team.id}`);

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
                teamCardsUpdated++;
              }
            } catch (err: any) {
              console.error(`Error processing card batch ${i}-${i + batch.length}:`, err.message);
            }
          }

          // Create log entry for this team
          const teamExecutionTime = Date.now() - teamStartTime;
          await WorkerLog.create({
            worker_name: "embeddings-generator",
            task_type: "embeddings",
            team_id: team.id,
            status: "success",
            message: `Generated embeddings for ${teamFactsUpdated} facts, ${teamRelationsUpdated} relations, ${teamCardsUpdated} cards`,
            execution_time_ms: teamExecutionTime,
            items_processed: factsNeedingEmbeddings.length + relationsNeedingEmbeddings.length + cardsNeedingEmbeddings.length,
            items_created: 0,
            items_updated: teamFactsUpdated + teamRelationsUpdated + teamCardsUpdated,
          });

          totalFactsUpdated += teamFactsUpdated;
          totalRelationsUpdated += teamRelationsUpdated;
          totalCardsUpdated += teamCardsUpdated;

          console.log(
            `Team ${team.id}: Updated embeddings for ${teamFactsUpdated} facts, ${teamRelationsUpdated} relations, ${teamCardsUpdated} cards`,
          );
        } catch (teamError: any) {
          console.error(`Error processing team ${team.id}:`, teamError);
          // Create error log for this team
          const teamExecutionTime = Date.now() - teamStartTime;
          await WorkerLog.create({
            worker_name: "embeddings-generator",
            task_type: "embeddings",
            team_id: team.id,
            status: "error",
            message: "Embeddings generation failed for team",
            execution_time_ms: teamExecutionTime,
            error: teamError.message || String(teamError),
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

