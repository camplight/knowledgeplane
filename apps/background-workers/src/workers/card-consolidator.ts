import {
  Fact,
  KnowledgeCard,
  FactRelation,
  WorkerLog,
  collections,
  cosineSimilarity,
  Workspace,
} from "@knowledgeplane/db";
import {
  getWorkspaceAIProvider,
  parseJsonResponse,
  type ChatMessage,
  type ChatCompletionOptions,
  type AIModelProvider,
} from "@knowledgeplane/aimodel";

// Gap #3 fix: Embedding similarity threshold for pre-filtering relation candidates
// With reranker: Lower threshold to 30% (over-fetch), then reranker filters to high-quality pairs
// Without reranker: Use higher threshold 45%
const EMBEDDING_SIMILARITY_THRESHOLD = 0.30; // Over-fetch candidates for reranking
const RERANKER_THRESHOLD = 0.35; // Cross-encoder reranker score threshold (tuned: F1=61.5% vs 60% baseline)
const RERANKER_URL = process.env.RERANKER_URL || "http://localhost:8082";
const THRESHOLD_EPSILON = 1e-9; // Epsilon for floating-point threshold comparisons

// LLM verification: Filter false positives for strong claims (causes, contradicts, depends_on)
// Uses same LLM as extraction (GPT-5.x) - follows Zep/Graphiti production pattern
const LLM_VERIFY_ENABLED = process.env.LLM_VERIFY_ENABLED !== "false";
const STRONG_CLAIM_TYPES = ["causes", "contradicts", "depends_on"]; // Verify these relation types

// LLM Verification confidence threshold (only accept high-confidence verdicts)
const VERIFICATION_CONFIDENCE_THRESHOLD = 0.75;

export class CardConsolidator {
  private interval: NodeJS.Timeout | null = null;
  private triggerCheckInterval: NodeJS.Timeout | null = null;
  private running = false;

  // Track analyzed fact pairs to avoid redundant LLM calls across sliding windows
  private analyzedPairKeys = new Set<string>();

  constructor() {
    // LLM provider/model are resolved per-workspace at runtime.
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

  async process(workspaceId?: string, factIds?: string[]) {
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
      const facts = await this.getUnconsolidatedFacts(workspaceId, factIds);

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
        // Sort facts by ID for deterministic batch ordering
        workspaceFacts.sort((a, b) => {
          const aId = a._key || a._id || "";
          const bId = b._key || b._id || "";
          return aId.localeCompare(bId);
        });
        console.log(`Processing ${workspaceFacts.length} facts for workspace ${workspaceId}`);

        const { provider: llmProvider, config } = await getWorkspaceAIProvider({
          workspaceId,
          getWorkspaceById: (id) => Workspace.findById(id),
        });

        // Create fact relations before grouping
        const workspaceRelationsCreated = await this.createFactRelations(
          workspaceFacts,
          llmProvider,
          config.chatModel,
        );
        relationsCreated += workspaceRelationsCreated;

        // Group facts by related clusters using graph traversal
        const factClusters = await this.groupRelatedFacts(workspaceFacts);

        for (const cluster of factClusters) {
          const knowledgeCard = await this.consolidateCluster(
            cluster,
            llmProvider,
            config.chatModel,
          );
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

  private async getUnconsolidatedFacts(
    workspaceId?: string,
    factIds?: string[],
  ): Promise<any[]> {
    // Get facts that are not in any knowledge card's fact_ids
    // Only process facts that have a workspace_id (workspace-scoped facts)
    const bindVars: Record<string, unknown> = {};
    const filters: string[] = [
      "fact.trashed == false",
      'fact.workspace_id != null AND fact.workspace_id != ""',
    ];

    if (workspaceId) {
      filters.push("fact.workspace_id == @workspaceId");
      bindVars.workspaceId = workspaceId;
    }

    if (factIds && factIds.length > 0) {
      filters.push("(fact._id IN @factIds OR fact._key IN @factIds)");
      bindVars.factIds = factIds;
    }

    const aql = `
      FOR fact IN facts
        FILTER ${filters.join(" AND ")}
        LET inCard = (
          FOR card IN knowledge_cards
            FILTER fact._id IN card.fact_ids
            LIMIT 1
            RETURN true
        )
        FILTER LENGTH(inCard) == 0
        SORT fact._key ASC
        LIMIT 100
        RETURN fact
    `;

    return await Fact.queryAQL(aql, bindVars);
  }

  /**
   * Generate a canonical key for a fact pair (order-independent).
   * Used to track which pairs have already been analyzed.
   */
  private getPairKey(factIdA: string, factIdB: string): string {
    return factIdA < factIdB ? `${factIdA}:${factIdB}` : `${factIdB}:${factIdA}`;
  }

  /**
   * Filter out pairs that have already been analyzed in previous windows.
   * This prevents redundant LLM calls for the 50% overlap region.
   */
  private filterUnanalyzedPairs(
    facts: any[],
    pairs: Array<{ i: number; j: number; similarity: number }>
  ): Array<{ i: number; j: number; similarity: number }> {
    const newPairs: typeof pairs = [];
    let skipped = 0;

    for (const pair of pairs) {
      const factA = facts[pair.i - 1];
      const factB = facts[pair.j - 1];
      if (!factA || !factB) continue;

      const key = this.getPairKey(factA._id || factA.id, factB._id || factB.id);
      if (this.analyzedPairKeys.has(key)) {
        skipped++;
        continue;
      }
      this.analyzedPairKeys.add(key);
      newPairs.push(pair);
    }

    if (skipped > 0) {
      console.log(`Pair tracking: Skipped ${skipped} already-analyzed pairs, ${newPairs.length} new pairs`);
    }

    return newPairs;
  }

  private async createFactRelations(
    facts: any[],
    llmProvider: AIModelProvider,
    chatModel: string,
  ): Promise<number> {
    if (facts.length < 2) {
      return 0; // Need at least 2 facts to create relations
    }

    // Reset pair tracking for this consolidation run
    this.analyzedPairKeys.clear();

    let relationsCreated = 0;
    const batchSize = 20; // Process facts in batches to avoid overwhelming the AI
    const overlap = 10; // 50% overlap for sliding window to catch cross-batch relations
    const step = batchSize - overlap; // Move by 10 facts each iteration

    // Process facts with SLIDING WINDOW (Gap #2 fix: catch cross-batch relations)
    // Batches: 0-19, 10-29, 20-39, 30-49... ensuring boundary facts get paired
    for (let i = 0; i < facts.length; i += step) {
      const batch = facts.slice(i, Math.min(i + batchSize, facts.length));

      // Skip if batch is too small (last partial batch with < 2 facts)
      if (batch.length < 2) {
        break;
      }

      try {
        // Gap #3 fix: Pre-filter using embedding similarity (over-fetch with low threshold)
        const similarPairs = this.findSimilarPairs(batch);

        // Filter out pairs already analyzed in previous windows (avoid redundant LLM calls)
        const newPairs = this.filterUnanalyzedPairs(batch, similarPairs);

        // Skip LLM calls if all pairs were already analyzed
        if (newPairs.length === 0) {
          console.log(`Window [${i}:${Math.min(i + batchSize, facts.length)}]: All pairs already analyzed, skipping`);
          continue;
        }

        // Step 2: Cross-encoder reranking to filter weak candidates
        const rerankedPairs = await this.rerankPairs(batch, newPairs);

        const relations = await this.identifyRelationsWithAI(
          batch,
          llmProvider,
          chatModel,
          rerankedPairs,
        );

        // Step 3: NLI verification to filter false positives
        // Uses DeBERTa entailment model to verify semantic validity
        const verifiedRelations = await this.verifyRelationsWithLLM(
          batch,
          llmProvider,
          chatModel,
          relations,
        );

        // Create relations that don't already exist
        for (const relation of verifiedRelations) {
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
          `Error creating relations for sliding window [${i}:${Math.min(i + batchSize, facts.length)}]:`,
          error.message,
        );
        // Continue with next window
      }
    }

    console.log(`Sliding window processing complete: ${Math.ceil(Math.max(0, facts.length - batchSize) / step) + 1} windows, ${relationsCreated} relations created`);

    return relationsCreated;
  }

  /**
   * Gap #3 fix: Pre-filter fact pairs using embedding similarity.
   * Returns pairs of (1-based) indices with similarity >= threshold.
   */
  private findSimilarPairs(facts: any[]): Array<{ i: number; j: number; similarity: number }> {
    const pairs: Array<{ i: number; j: number; similarity: number }> = [];

    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const embA = facts[i].embedding;
        const embB = facts[j].embedding;

        // Skip if either fact lacks embeddings (placeholder zero vectors have embedding_model: null)
        if (!embA || !embB || !facts[i].embedding_model || !facts[j].embedding_model) {
          continue;
        }

        try {
          const similarity = cosineSimilarity(embA, embB);
          if (similarity >= EMBEDDING_SIMILARITY_THRESHOLD) {
            // Use 1-based indices for AI prompt consistency
            pairs.push({ i: i + 1, j: j + 1, similarity });
          }
        } catch (error: any) {
          // Skip pair if embedding dimensions don't match
          console.warn(`Embedding mismatch for facts ${i+1}-${j+1}: ${error.message}`);
        }
      }
    }

    // Sort by similarity descending (most similar first)
    pairs.sort((a, b) => b.similarity - a.similarity);

    console.log(`Embedding pre-filter: ${pairs.length} similar pairs found (threshold >= ${EMBEDDING_SIMILARITY_THRESHOLD})`);
    return pairs;
  }

  /**
   * Step 2: Cross-encoder reranking using BGE-M3 model.
   * Filters embedding-similar pairs to only those with strong semantic relevance.
   * Falls back gracefully if reranker service is unavailable.
   */
  private async rerankPairs(
    facts: any[],
    pairs: Array<{ i: number; j: number; similarity: number }>
  ): Promise<Array<{ i: number; j: number; similarity: number; rerankScore?: number }>> {
    if (pairs.length === 0) {
      return pairs;
    }

    try {
      // Build request payload with fact content pairs
      const requestPairs = pairs.map(p => ({
        fact_a: facts[p.i - 1]?.content || "",
        fact_b: facts[p.j - 1]?.content || "",
      }));

      const response = await fetch(`${RERANKER_URL}/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairs: requestPairs,
          threshold: RERANKER_THRESHOLD,
        }),
      });

      if (!response.ok) {
        console.warn(`Reranker service returned ${response.status}, using embedding scores only`);
        return pairs;
      }

      const data = (await response.json()) as { results?: Array<{ index: number; score: number; keep: boolean }> };
      const results = data.results || [];

      // Filter pairs that passed reranker threshold
      const rerankedPairs: Array<{ i: number; j: number; similarity: number; rerankScore: number }> = [];
      for (const result of results) {
        if (result.keep && result.index < pairs.length) {
          const originalPair = pairs[result.index];
          rerankedPairs.push({
            ...originalPair,
            rerankScore: result.score,
          });
        }
      }

      // Sort by rerank score (highest first)
      rerankedPairs.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));

      const filtered = pairs.length - rerankedPairs.length;
      console.log(`Reranker: ${rerankedPairs.length} pairs kept, ${filtered} filtered (threshold >= ${RERANKER_THRESHOLD})`);

      return rerankedPairs;
    } catch (error: any) {
      // Graceful fallback if reranker is unavailable
      console.warn(`Reranker service unavailable (${error.message}), using embedding scores only`);
      return pairs;
    }
  }

  /**
   * Step 3: LLM verification for strong claims (causes, contradicts, depends_on).
   * Uses Chain-of-Thought reasoning with evidence requirements and confidence scoring.
   * Includes negative examples to calibrate rejection of spurious relations.
   */
  private async verifyRelationsWithLLM(
    facts: any[],
    llmProvider: AIModelProvider,
    chatModel: string,
    relations: Array<{ from_index: number; to_index: number; type: string; reason?: string }>
  ): Promise<Array<{ from_index: number; to_index: number; type: string; reason?: string }>> {
    if (!LLM_VERIFY_ENABLED || relations.length === 0) {
      return relations;
    }

    // Only verify strong claims - weak relations (related_to, references) pass through
    const strongRelations = relations.filter(r => STRONG_CLAIM_TYPES.includes(r.type));
    const weakRelations = relations.filter(r => !STRONG_CLAIM_TYPES.includes(r.type));

    if (strongRelations.length === 0) {
      return relations; // No strong claims to verify
    }

    try {
      // Build verification prompt with numbered claims
      const verificationsNeeded = strongRelations.map((rel, idx) => {
        const fromFact = facts[rel.from_index - 1];
        const toFact = facts[rel.to_index - 1];
        return `Claim ${idx + 1}:
  Fact A: "${fromFact?.content}"
  Fact B: "${toFact?.content}"
  Relation: "${rel.type}"`;
      }).join("\n\n");

      // CoT verification prompt with negative examples and confidence scoring
      const systemPrompt = `You are a rigorous fact-relation verifier. Your task is to verify whether causal/logical claims between facts are actually supported by the text.

FOR EACH CLAIM, follow these Chain-of-Thought reasoning steps:
1. EXTRACT: What specific claim does Fact A make?
2. EXTRACT: What specific claim does Fact B make?
3. ANALYZE: Does Fact A truly have a "${strongRelations[0]?.type || 'causal'}" relationship with Fact B?
4. EVIDENCE: Quote the specific words/phrases that support or refute this relation.
5. VERDICT: true (clearly supported), false (not supported or spurious)
6. CONFIDENCE: Score from 0.0 to 1.0 based on evidence strength

RELATION TYPE DEFINITIONS:
- "causes": Fact A describes something that DIRECTLY leads to or produces the outcome in Fact B. Must have explicit causal mechanism.
- "contradicts": Fact A and Fact B make INCOMPATIBLE claims that cannot both be true simultaneously.
- "depends_on": Fact A REQUIRES or PRESUPPOSES the condition/state described in Fact B to be true.

=== FALSE POSITIVE EXAMPLES (you MUST mark these as FALSE) ===

Example 1 - Spurious correlation:
  Fact A: "Python was created by Guido van Rossum in 1991"
  Fact B: "Modern programming languages need interpreters or compilers"
  Relation: "causes"
  VERDICT: FALSE, CONFIDENCE: 0.1
  REASON: Both facts are about programming but there is NO causal link. Python's creation doesn't cause the need for interpreters.

Example 2 - Topic overlap without causation:
  Fact A: "Tesla stock rose 5% yesterday"
  Fact B: "Electric vehicles are becoming more popular worldwide"
  Relation: "causes"
  VERDICT: FALSE, CONFIDENCE: 0.2
  REASON: Correlation is not causation. Stock price changes don't cause EV popularity (or vice versa in this framing).

Example 3 - General advice vs specific behavior:
  Fact A: "The API endpoint returns a JSON response"
  Fact B: "JSON responses should be validated before use"
  Relation: "depends_on"
  VERDICT: FALSE, CONFIDENCE: 0.15
  REASON: Returning JSON doesn't depend on validation practices - these are independent statements.

Example 4 - Temporal sequence without causation:
  Fact A: "The company was founded in 2010"
  Fact B: "The company went public in 2020"
  Relation: "causes"
  VERDICT: FALSE, CONFIDENCE: 0.2
  REASON: Founding preceded IPO but didn't cause it - many founded companies never go public.

=== TRUE POSITIVE EXAMPLES (mark these as TRUE) ===

Example 1 - Direct causal mechanism:
  Fact A: "Buffer overflow occurs when input data exceeds allocated memory bounds"
  Fact B: "The system crashed due to a buffer overflow in the input handler"
  Relation: "causes"
  VERDICT: TRUE, CONFIDENCE: 0.9
  REASON: Explicit causal chain - buffer overflow (defined in A) caused the crash (stated in B).

Example 2 - Clear dependency:
  Fact A: "The payment API requires OAuth2 authentication tokens"
  Fact B: "Users must login to obtain authentication tokens"
  Relation: "depends_on"
  VERDICT: TRUE, CONFIDENCE: 0.85
  REASON: Using the payment API depends on having tokens, which requires login.

Return JSON with this structure:
{
  "reasoning": [
    {
      "claim_index": 1,
      "fact_a_summary": "brief summary of Fact A's claim",
      "fact_b_summary": "brief summary of Fact B's claim",
      "analysis": "step-by-step reasoning about whether the relation holds",
      "evidence_for": "quoted text supporting the relation, or 'none'",
      "evidence_against": "reasons why the relation might be spurious, or 'none'",
      "verdict": true or false,
      "confidence": 0.0 to 1.0
    }
  ],
  "verdicts": [true/false for each claim in order],
  "confidences": [0.0-1.0 for each claim in order]
}`;

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Verify these ${strongRelations.length} relation claims. Be SKEPTICAL - only mark TRUE if there is clear textual evidence for the causal/logical relationship.

${verificationsNeeded}

Apply the Chain-of-Thought reasoning process for each claim. Return the structured JSON with reasoning, verdicts, and confidence scores.`
        }
      ];

      const options: ChatCompletionOptions = {
        model: chatModel,
        temperature: 0,
        maxTokens: 1500, // Increased for CoT reasoning output
        responseFormat: "json_object",
      };

      const response = await llmProvider.chatCompletion(messages, options);
      const content = response.content || "{}";

      let verdicts: boolean[] = [];
      let confidences: number[] = [];
      let reasoning: Array<{ claim_index: number; analysis: string; verdict: boolean; confidence: number }> = [];

      try {
        const parsed = parseJsonResponse(content);
        verdicts = Array.isArray(parsed.verdicts) ? parsed.verdicts : [];
        confidences = Array.isArray(parsed.confidences) ? parsed.confidences : [];
        reasoning = Array.isArray(parsed.reasoning) ? parsed.reasoning : [];
      } catch {
        console.warn("LLM Verifier: Failed to parse JSON, keeping all relations");
        return relations;
      }

      // Filter strong relations based on verification AND confidence threshold
      const verifiedStrong: typeof relations = [];
      let filteredByVerdict = 0;
      let filteredByConfidence = 0;

      for (let i = 0; i < strongRelations.length; i++) {
        const verdict = verdicts[i];
        const confidence = confidences[i] ?? 1.0; // Default to 1.0 if not provided
        const reasoningEntry = reasoning[i];

        if (!verdict) {
          filteredByVerdict++;
          // Log rejected relations for debugging
          if (reasoningEntry?.analysis) {
            console.log(`LLM Verifier rejected (verdict=false): ${strongRelations[i].type}`);
            console.log(`  Analysis: ${reasoningEntry.analysis.substring(0, 150)}...`);
          }
        } else if (confidence < VERIFICATION_CONFIDENCE_THRESHOLD) {
          filteredByConfidence++;
          console.log(`LLM Verifier rejected (low confidence=${confidence.toFixed(2)}): ${strongRelations[i].type}`);
        } else {
          verifiedStrong.push(strongRelations[i]);
        }
      }

      const totalFiltered = filteredByVerdict + filteredByConfidence;
      console.log(`LLM Verifier: ${verifiedStrong.length}/${strongRelations.length} strong claims verified`);
      console.log(`  Filtered: ${filteredByVerdict} by verdict, ${filteredByConfidence} by confidence (<${VERIFICATION_CONFIDENCE_THRESHOLD})`);

      // Return verified strong relations + all weak relations
      return [...verifiedStrong, ...weakRelations];
    } catch (error: any) {
      console.warn(`LLM verification failed (${error.message}), keeping all relations`);
      return relations;
    }
  }

  /**
   * Combined approach: Entity extraction + CoT + Confidence filtering
   * Single LLM call that extracts entities inline and reasons about relations
   */
  private async identifyRelationsWithAI(
    facts: any[],
    llmProvider: AIModelProvider,
    chatModel: string,
    similarPairs?: Array<{ i: number; j: number; similarity: number }>
  ): Promise<
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

    // Combined Entity + CoT + Confidence + Few-shot prompt
    const systemPrompt = `You are a knowledge graph expert. Your task is to identify meaningful relationships between facts.

PROCESS (follow these steps):
1. EXTRACT ENTITIES: For each fact, identify key entities (people, places, concepts, products, organizations)
2. FIND SHARED ENTITIES: Note which facts share the same or related entities
3. REASON ABOUT RELATIONS: For facts that share entities, determine if there's a meaningful relationship
4. ASSIGN CONFIDENCE: Rate your confidence (0.0-1.0) based on how clear the connection is

Valid relationship types (use ONLY these):
${VALID_RELATION_TYPES.map(t => `- "${t}"`).join("\n")}

=== EXAMPLES ===

GOOD relation (include):
Facts:
1. "Python 3.9 introduced the walrus operator for assignment expressions"
2. "The walrus operator (:=) allows assignment within expressions in Python"
→ Relation: 1 -> 2, type="supports", confidence=0.95, shared_entity="walrus operator"
Why: Same specific concept, fact 2 explains what fact 1 introduced.

GOOD relation (include):
Facts:
1. "Tesla uses lithium-ion batteries in their electric vehicles"
2. "Lithium-ion batteries require careful thermal management"
→ Relation: 1 -> 2, type="depends_on", confidence=0.85, shared_entity="lithium-ion batteries"
Why: Fact 1's subject depends on the constraint in fact 2.

BAD relation (DO NOT include):
Facts:
1. "Python is a programming language"
2. "JavaScript is also a programming language"
→ No relation. Why: Just because both are programming languages doesn't create a meaningful relationship. No causal, supporting, or referential connection.

BAD relation (DO NOT include):
Facts:
1. "The company was founded in 2010"
2. "2010 was a leap year"
→ No relation. Why: Coincidental year mention, no semantic connection.

=== END EXAMPLES ===

Return JSON with this structure:
{
  "entity_analysis": {
    "1": ["entity1", "entity2"],
    "2": ["entity2", "entity3"]
  },
  "shared_entities": ["Facts 1 & 2 share: entity2"],
  "relations": [
    {
      "from_index": 1,
      "to_index": 2,
      "type": "related_to",
      "confidence": 0.85,
      "shared_entity": "entity2",
      "reason": "Both facts discuss entity2 in the context of X"
    }
  ]
}

IMPORTANT RULES:
- Use fact NUMBERS (1-based), not content
- confidence must be 0.0-1.0 (be conservative - only high confidence relations)
- ONLY create relations where facts share an entity AND have meaningful semantic connection
- Avoid relations based on coincidental keyword matches
- Quality over quantity: 3 confident relations > 10 uncertain ones`;

    const factContents = facts
      .map((f, idx) => `${idx + 1}. ${f.content}`)
      .join("\n");

    // Gap #3: Include embedding similarity hints
    let embeddingHints = "";
    if (similarPairs && similarPairs.length > 0) {
      const topPairs = similarPairs.slice(0, 10);
      const pairDescriptions = topPairs
        .map(p => `  - Facts ${p.i} & ${p.j} (${(p.similarity * 100).toFixed(0)}% similar)`)
        .join("\n");
      embeddingHints = `
EMBEDDING SIMILARITY (semantically related pairs):
${pairDescriptions}
`;
    }

    const userPrompt = `Analyze these ${facts.length} facts. Extract entities, find shared entities, then identify high-confidence relationships:

${factContents}
${embeddingHints}
Remember: Only include relations with confidence >= 0.7 and clear entity/semantic connections.`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const chatOptions: ChatCompletionOptions = {
      model: chatModel,
      temperature: 0, // Deterministic extraction for reproducible benchmarks
      responseFormat: "json_object",
    };

    const response = await llmProvider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = parseJsonResponse(response.content);

    // Log entity analysis if provided
    if (parsed.entity_analysis) {
      const entityCount = Object.values(parsed.entity_analysis).flat().length;
      console.log(`Entity+CoT: Extracted ${entityCount} entities from ${Object.keys(parsed.entity_analysis).length} facts`);
    }
    if (parsed.shared_entities && parsed.shared_entities.length > 0) {
      console.log(`Entity+CoT: Found ${parsed.shared_entities.length} shared entity pairs`);
    }

    const relations = parsed.relations || [];
    const CONFIDENCE_THRESHOLD = 0.7;
    let filteredByConfidence = 0;

    // Validate and filter relations
    const validRelations = relations.filter((rel: any) => {
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

      // Filter by confidence threshold
      const confidence = typeof rel.confidence === "number" ? rel.confidence : 0.5;
      if (confidence < CONFIDENCE_THRESHOLD) {
        filteredByConfidence++;
        return false;
      }

      // Validate relation type
      if (!VALID_RELATION_TYPES.includes(rel.type)) {
        console.warn(`Invalid relation type: ${rel.type}, using "related_to"`);
        rel.type = "related_to";
      }

      return true;
    });

    if (filteredByConfidence > 0) {
      console.log(`Entity+CoT: Filtered ${filteredByConfidence} low-confidence relations (threshold=${CONFIDENCE_THRESHOLD})`);
    }
    console.log(`Entity+CoT: Returning ${validRelations.length} high-confidence relations`);

    return validRelations;
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

  private async consolidateCluster(
    facts: any[],
    llmProvider: AIModelProvider,
    chatModel: string,
  ): Promise<any | null> {
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
    const consolidation = await this.consolidateWithAI(
      llmProvider,
      chatModel,
      factContents,
    );

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
    llmProvider: AIModelProvider,
    chatModel: string,
    factContents: string,
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

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const chatOptions: ChatCompletionOptions = {
      model: chatModel,
      temperature: 0.7,
      responseFormat: "json_object",
    };

    const response = await llmProvider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = parseJsonResponse(response.content);
    return {
      title: parsed.title || "Untitled Card",
      summary: parsed.summary || "",
      content: parsed.content || "",
    };
  }
}
