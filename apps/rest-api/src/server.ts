import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  init,
  Fact,
  FactRelation,
  KnowledgeCard,
  Webhook,
  User,
  WorkspaceMember,
  requireAuth,
  collections,
  type AuthContext,
} from "@knowledgeplane/db";
import {
  searchFacts,
  searchKnowledgeCards,
  splitKnowledgeCard,
  combineKnowledgeCards,
} from "@knowledgeplane/api-core";
import { createAIModelClient } from "@knowledgeplane/aimodel";
import { CardConsolidator } from "knowledgeplane-background-worker/card-consolidator";


type RequestContext = {
  userId?: string;
  workspaceId?: string;
  authContext?: AuthContext;
};

type EmbeddingRecord = {
  embedding?: unknown;
  embedding_model?: unknown;
  _id?: unknown;
  _key?: unknown;
};

/**
 * Generate embedding synchronously for a single text content.
 * Used when sync_embedding=true query parameter is passed to fact creation.
 *
 * @param content - Text content to generate embedding for
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Embedding result or null if generation fails/unavailable
 */
async function generateEmbeddingSync(
  content: string,
  timeoutMs: number = 30000,
): Promise<{ embedding: number[]; model: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const aiClient = createAIModelClient("openai", apiKey);
  const provider = aiClient.getProvider();
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

  // Truncate content if needed (OpenAI has token limits)
  const maxChars = 8000 * 3; // ~8000 tokens with conservative estimate
  const truncatedContent = content.length > maxChars
    ? content.substring(0, maxChars)
    : content;

  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Embedding generation timed out")), timeoutMs);
  });

  // Race between embedding generation and timeout
  const result = await Promise.race([
    provider.embeddings(truncatedContent, model),
    timeoutPromise,
  ]);

  return {
    embedding: result.embeddings[0],
    model: result.model,
  };
}

function stripEmbeddings<T extends EmbeddingRecord>(
  record: T,
): Omit<T, "embedding" | "embedding_model" | "_id" | "_key"> {
  if (!record) {
    return record as Omit<T, "embedding" | "embedding_model" | "_id" | "_key">;
  }
  const { embedding, embedding_model, _id, _key, ...rest } = record as EmbeddingRecord &
    Record<string, unknown>;
  return rest as Omit<T, "embedding" | "embedding_model" | "_id" | "_key">;
}

function stripEmbeddingsArray<T extends EmbeddingRecord>(
  records: T[],
): Array<Omit<T, "embedding" | "embedding_model" | "_id" | "_key">> {
  return records.map((record) => stripEmbeddings(record));
}

function stripEmbeddingsDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripEmbeddingsDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === "embedding" ||
        key === "embedding_model" ||
        key === "_id" ||
        key === "_key"
      ) {
        continue;
      }
      result[key] = stripEmbeddingsDeep(val);
    }
    return result as T;
  }
  return value;
}

async function resolveContext(
  request: any,
  reply: any,
): Promise<RequestContext | null> {
  const query = (request.query || {}) as Record<string, string>;
  const apiKeyFromHeader = (request.headers["knowledgeplane-key"] ||
    request.headers["knowledgeplane_key"]) as string | undefined;
  const apiKeyFromQuery = query.api_key as string | undefined;
  const apiKey = apiKeyFromHeader || apiKeyFromQuery;
  const authorization = request.headers.authorization as string | undefined;

  let authContext: AuthContext | undefined;
  try {
    if (authorization || apiKey) {
      authContext = await requireAuth(authorization, apiKey);
    }
  } catch (error: any) {
    reply.code(401);
    reply.send({ error: error?.message || "Unauthorized" });
    return null;
  }

  let userId = authContext?.userId;
  if (!userId && query.username && query.email) {
    const user = await User.getOrCreate({
      username: query.username,
      email: query.email,
    });
    userId = user.id;
  }

  // SECURITY FIX: workspace_id from query parameter requires verification
  // Priority order: 1) Auth context workspace, 2) Verified query param workspace, 3) User's first workspace
  let workspaceId: string | undefined;

  // First priority: workspace from authenticated API key or token
  if (authContext?.workspaceId) {
    workspaceId = authContext.workspaceId;
  }

  // Second priority: query param workspace_id with membership verification
  // User must be a member of the workspace to use it
  if (!workspaceId && query.workspace_id && userId) {
    const requestedWorkspaceId = query.workspace_id;
    // Verify user is a member of the requested workspace
    const userWorkspaces = await WorkspaceMember.findByUser(userId, 100, 0);
    const isMember = userWorkspaces.some(
      (m) => m.workspace_id === requestedWorkspaceId ||
             m.workspace_id === `workspaces/${requestedWorkspaceId}`
    );
    if (isMember) {
      workspaceId = requestedWorkspaceId;
    }
    // If not a member, silently ignore (fall through to default workspace)
  }

  // Third priority: user's first workspace membership (if authenticated but no workspace yet)
  if (!workspaceId && userId) {
    const userWorkspaces = await WorkspaceMember.findByUser(userId, 1, 0);
    if (userWorkspaces.length > 0) {
      workspaceId = userWorkspaces[0].workspace_id;
    }
  }

  return { userId, workspaceId, authContext };
}

function requireWorkspace(ctx: RequestContext, reply: any) {
  if (!ctx.workspaceId) {
    reply.code(400);
    return { error: "workspace_id is required or must be inferred from auth" };
  }
  return null;
}

/**
 * SECURITY FIX: Verify that a resource belongs to the user's workspace.
 * Prevents IDOR attacks where users access resources by guessing IDs.
 */
async function requireWorkspaceOwnership(
  resourceWorkspaceId: string | undefined,
  ctx: RequestContext,
  reply: any,
  resourceType: string = "Resource"
): Promise<boolean> {
  if (!ctx.workspaceId) {
    reply.code(400);
    reply.send({ error: "workspace_id is required" });
    return false;
  }

  if (!resourceWorkspaceId) {
    // Resource has no workspace - could be legacy data
    reply.code(403);
    reply.send({ error: `${resourceType} has no workspace association` });
    return false;
  }

  // Normalize both to compare (handle "workspaces/123" vs "123")
  const normalizeWsId = (id: string) => id.includes('/') ? id : `workspaces/${id}`;
  const normalizedResource = normalizeWsId(resourceWorkspaceId);
  const normalizedContext = normalizeWsId(ctx.workspaceId);

  if (normalizedResource !== normalizedContext) {
    reply.code(403);
    reply.send({ error: `${resourceType} does not belong to your workspace` });
    return false;
  }

  return true;
}

export async function createServer(options?: { skipDbInit?: boolean }) {
  const server = Fastify({ logger: true });

  await server.register(cors, {
    origin: true,
  });

  if (!options?.skipDbInit) {
    await init();
  }

  server.get("/health", async () => {
    return { status: "ok" };
  });


  server.get("/api/facts", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const { limit = 50, offset = 0, include_trashed = false } =
      request.query as any;

    const facts = await Fact.list(
      ctx.workspaceId,
      limit,
      offset,
      include_trashed === "true",
    );
    return { facts: stripEmbeddingsArray(facts) };
  });

  server.get("/api/facts/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const fact = await Fact.findById(id);

    if (!fact) {
      reply.code(404);
      return { error: "Fact not found" };
    }

    // SECURITY: Verify fact belongs to user's workspace
    const hasAccess = await requireWorkspaceOwnership(fact.workspace_id, ctx, reply, "Fact");
    if (!hasAccess) return;

    return { fact: stripEmbeddings(fact) };
  });

  server.post("/api/facts", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const body = request.body as any;
    let workspaceId = body.workspace_id || ctx.workspaceId;
    if (!workspaceId) {
      reply.code(400);
      return { error: "workspace_id is required or must be inferred from auth" };
    }
    // Normalize workspace_id to full format (workspaces/xxx) for consistency
    // This ensures facts stored with "668" vs "workspaces/668" are handled consistently
    if (!workspaceId.includes('/')) {
      workspaceId = `workspaces/${workspaceId}`;
    }
    const createdBy = body.created_by || ctx.userId;
    const lastUpdatedBy = body.last_updated_by || ctx.userId || body.created_by;
    if (!createdBy || !lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for writes" };
    }
    const fact = await Fact.write({
      content: body.content,
      metadata: body.metadata,
      workspace_id: workspaceId,
      created_by: createdBy,
      last_updated_by: lastUpdatedBy,
    });

    // Check for sync_embedding query parameter
    // When true, generates embedding synchronously before returning
    // This is useful for benchmarking or when facts need to be immediately searchable
    const query = request.query as { sync_embedding?: string };
    const syncEmbedding = query.sync_embedding === "true";

    let embeddingGenerated = false;
    let embeddingModel: string | undefined;
    let embeddingError: string | undefined;

    if (syncEmbedding) {
      try {
        const timeoutMs = parseInt(process.env.SYNC_EMBEDDING_TIMEOUT_MS || "30000", 10);
        const embeddingResult = await generateEmbeddingSync(body.content, timeoutMs);

        if (embeddingResult) {
          // Update fact with embedding
          const key = Fact.extractKey(fact.id);
          await collections.facts.update(key, {
            embedding: embeddingResult.embedding,
            embedding_model: embeddingResult.model,
          });

          embeddingGenerated = true;
          embeddingModel = embeddingResult.model;
        } else {
          embeddingError = "Embedding service unavailable (no API key configured)";
        }
      } catch (error: any) {
        // Log error but still return the created fact
        console.error("Sync embedding generation failed:", error.message);
        embeddingError = error.message;
      }
    }

    // Build response
    const response: Record<string, any> = {
      fact: stripEmbeddings(fact),
    };

    // Include embedding status when sync_embedding was requested
    if (syncEmbedding) {
      response.embedding_generated = embeddingGenerated;
      if (embeddingModel) {
        response.embedding_model = embeddingModel;
      }
      if (embeddingError) {
        response.embedding_error = embeddingError;
        response.warning = "Fact created but embedding generation failed. Fact will be indexed by background worker.";
      }
    } else {
      // Queue embedding generation for async processing
      // This triggers the background worker to process this specific fact
      try {
        await collections.worker_triggers.save({
          worker_name: "embeddings-generator",
          status: "pending",
          created_at: new Date().toISOString(),
          metadata: {
            type: "fact",
            id: fact.id,
            workspace_id: workspaceId,
          },
        });
        response.embedding_queued = true;
      } catch (triggerError: any) {
        // Non-fatal: sweep will catch it within 10 minutes
        console.error("Failed to queue embedding trigger:", triggerError.message);
      }
    }

    return response;
  });

  server.put("/api/facts/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const body = request.body as any;
    const lastUpdatedBy = body.last_updated_by || ctx.userId;
    if (!lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for updates" };
    }

    // SECURITY: Verify fact exists and belongs to user's workspace
    const existingFact = await Fact.findById(id);
    if (!existingFact) {
      reply.code(404);
      return { error: "Fact not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(existingFact.workspace_id, ctx, reply, "Fact");
    if (!hasAccess) return;

    const fact = await Fact.update({
      id,
      content: body.content,
      metadata: body.metadata,
      last_updated_by: lastUpdatedBy,
    });

    return { fact: stripEmbeddings(fact) };
  });

  server.delete("/api/facts/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const { last_updated_by } = request.query as any;
    const lastUpdatedBy = last_updated_by || ctx.userId;
    if (!lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for deletes" };
    }

    // SECURITY: Verify fact exists and belongs to user's workspace
    const existingFact = await Fact.findById(id);
    if (!existingFact) {
      reply.code(404);
      return { error: "Fact not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(existingFact.workspace_id, ctx, reply, "Fact");
    if (!hasAccess) return;

    const fact = await Fact.trash(id, lastUpdatedBy);
    return { fact: stripEmbeddings(fact) };
  });

  server.post("/api/facts/search", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const body = request.body as any;
    // Normalize workspace_id to full format for consistency with fact storage
    let workspaceId = ctx.workspaceId;
    if (workspaceId && !workspaceId.includes('/')) {
      workspaceId = `workspaces/${workspaceId}`;
    }
    const results = await searchFacts({
      query: body.query || "*",
      workspace_id: workspaceId,
      k: body.k || 10,
      offset: body.offset || 0,
      include_trashed: body.include_trashed || false,
    });
    return {
      ...results,
      hits: stripEmbeddingsArray(results.hits as EmbeddingRecord[]),
    };
  });

  // Trigger embedding generation for facts
  server.post("/api/facts/trigger-embeddings", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const body = request.body as { fact_ids?: string[]; namespace?: string };

    try {
      let factIds = body.fact_ids || [];

      // If no specific IDs provided, find all facts needing embeddings in workspace
      if (factIds.length === 0) {
        const aql = body.namespace
          ? `
            FOR f IN facts
              FILTER f.workspace_id == @wid
              FILTER f.metadata.namespace == @ns
              FILTER !HAS(f, 'embedding') OR LENGTH(f.embedding) == 0
              LIMIT 1000
              RETURN f._id
          `
          : `
            FOR f IN facts
              FILTER f.workspace_id == @wid
              FILTER !HAS(f, 'embedding') OR LENGTH(f.embedding) == 0
              LIMIT 1000
              RETURN f._id
          `;

        const cursor = await collections.facts.database.query(aql, {
          wid: ctx.workspaceId,
          ns: body.namespace,
        });
        factIds = await cursor.all();
      }

      // Create worker triggers for embedding generation
      const triggers = factIds.map((factId) => ({
        worker_name: "embeddings-generator",
        status: "pending",
        created_at: new Date().toISOString(),
        metadata: {
          type: "fact",
          id: factId,
          workspace_id: ctx.workspaceId,
        },
      }));

      if (triggers.length > 0) {
        // Bulk insert triggers
        await collections.worker_triggers.saveAll(triggers);
      }

      return {
        success: true,
        triggered_count: triggers.length,
        message: `Triggered embedding generation for ${triggers.length} facts. Worker will process within 30 seconds.`,
      };
    } catch (error: any) {
      reply.code(500);
      return { error: error.message || "Failed to trigger embeddings" };
    }
  });

  // Trigger card consolidator for a specific workspace or set of facts
  // POST /api/facts/trigger-consolidation
  // Body: { workspace_id?: string, fact_ids?: string[], wait?: boolean }
  server.post("/api/facts/trigger-consolidation", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    try {
      const body = request.body as {
        workspace_id?: string;
        fact_ids?: string[];
        wait?: boolean;
      };

      const workspaceId = body.workspace_id || ctx.workspaceId;
      const wait = body.wait ?? false;
      const factIds = body.fact_ids || [];

      // Debug logging for fact_ids
      console.log(`[trigger-consolidation] Received request:`);
      console.log(`  workspace_id: ${workspaceId}`);
      console.log(`  fact_ids: ${factIds.length} items`);
      console.log(`  wait: ${wait}`);
      if (factIds.length > 0) {
        console.log(`  first 3 fact_ids: ${factIds.slice(0, 3).join(', ')}`);
      }

      // Create trigger for card consolidator
      const trigger = await collections.worker_triggers.save({
        worker_name: "card-consolidator",
        workspace_id: workspaceId,
        fact_ids: factIds,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log(`[trigger-consolidation] Created trigger ${trigger._id} with ${factIds.length} fact_ids`);

      // Verify the trigger was saved correctly by re-reading it
      const triggerKey = trigger._key || trigger._id?.split('/')[1];
      const savedTrigger = await collections.worker_triggers.document(triggerKey);
      console.log(`[trigger-consolidation] Verified saved trigger:`);
      console.log(`  saved fact_ids type: ${typeof savedTrigger.fact_ids}`);
      console.log(`  saved fact_ids is array: ${Array.isArray(savedTrigger.fact_ids)}`);
      console.log(`  saved fact_ids length: ${savedTrigger.fact_ids?.length ?? 'undefined'}`);

      // If wait=true, run consolidation DIRECTLY (sync) instead of relying on background worker
      if (wait) {
        const triggerKey = trigger._key || trigger._id?.split('/')[1];

        console.log(`[trigger-consolidation] Running SYNC consolidation for ${factIds.length} facts`);
        const startTime = Date.now();

        try {
          // Mark trigger as processing
          await collections.worker_triggers.update(triggerKey, {
            status: "processing",
            updated_at: new Date().toISOString(),
          });

          // Run consolidation directly - no background worker dependency
          const consolidator = new CardConsolidator();
          await consolidator.process(workspaceId, factIds);

          const durationMs = Date.now() - startTime;
          console.log(`[trigger-consolidation] SYNC consolidation completed in ${durationMs}ms`);

          // Mark trigger as completed
          await collections.worker_triggers.update(triggerKey, {
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          return {
            success: true,
            status: "completed",
            message: `Card consolidation completed in ${durationMs}ms`,
            trigger_id: trigger._id,
            duration_ms: durationMs,
          };
        } catch (error: any) {
          const durationMs = Date.now() - startTime;
          console.error(`[trigger-consolidation] SYNC consolidation failed after ${durationMs}ms:`, error);

          // Mark trigger as failed
          await collections.worker_triggers.update(triggerKey, {
            status: "failed",
            error: error.message || String(error),
            updated_at: new Date().toISOString(),
          });

          return {
            success: false,
            status: "failed",
            error: error.message || "Consolidation failed",
            trigger_id: trigger._id,
            duration_ms: durationMs,
          };
        }
      }

      return {
        success: true,
        status: "pending",
        message: "Triggered card consolidation. Worker will process within 30 seconds.",
        trigger_id: trigger._id,
      };
    } catch (error: any) {
      reply.code(500);
      return { error: error.message || "Failed to trigger consolidation" };
    }
  });

  server.get("/api/relations", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const { from_fact, to_fact, type, limit = 50, offset = 0 } =
      request.query as any;

    const relations = await FactRelation.query({
      workspace_id: ctx.workspaceId,
      from_fact,
      to_fact,
      type,
      limit,
      offset,
    });

    return { relations: stripEmbeddingsArray(relations) };
  });

  server.delete("/api/relations/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const { deleted_by } = request.query as any;
    const deletedBy = deleted_by || ctx.userId;
    if (!deletedBy) {
      reply.code(401);
      return { error: "User ID is required for deletes" };
    }

    // SECURITY: Verify relation exists and belongs to user's workspace
    const existingRelation = await FactRelation.findById(id);
    if (!existingRelation) {
      reply.code(404);
      return { error: "Relation not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(existingRelation.workspace_id, ctx, reply, "Relation");
    if (!hasAccess) return;

    try {
      const relation = await FactRelation.delete(id, deletedBy);
      return { relation: stripEmbeddings(relation) };
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  });

  server.post("/api/relations", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const body = request.body as any;
    const workspaceId = body.workspace_id || ctx.workspaceId;
    if (!workspaceId) {
      reply.code(400);
      return { error: "workspace_id is required or must be inferred from auth" };
    }
    const createdBy = body.created_by || ctx.userId;
    if (!createdBy) {
      reply.code(401);
      return { error: "User ID is required for writes" };
    }
    const relation = await FactRelation.create({
      from_fact: body.from_fact,
      to_fact: body.to_fact,
      type: body.type,
      metadata: body.metadata,
      workspace_id: workspaceId,
      created_by: createdBy,
    });

    // Queue embedding generation for the relation
    try {
      await collections.worker_triggers.save({
        worker_name: "embeddings-generator",
        status: "pending",
        created_at: new Date().toISOString(),
        metadata: {
          type: "relation",
          id: relation.id,
          workspace_id: workspaceId,
        },
      });
    } catch (triggerError: any) {
      // Non-fatal: sweep will catch it within 10 minutes
      console.error("Failed to queue relation embedding trigger:", triggerError.message);
    }

    return { relation: stripEmbeddings(relation) };
  });

  server.get("/api/facts/:id/relations", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const { type } = request.query as any;

    // SECURITY: Verify fact exists and belongs to user's workspace
    const fact = await Fact.findById(id);
    if (!fact) {
      reply.code(404);
      return { error: "Fact not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(fact.workspace_id, ctx, reply, "Fact");
    if (!hasAccess) return;

    const outgoing = await FactRelation.getRelatedFacts(id, type);
    const incoming = await FactRelation.getIncomingRelations(id, type);

    // SECURITY: Filter relations to only those in user's workspace
    const filterByWorkspace = (items: any[]) => items.filter(r => {
      const wsId = r.relation?.workspace_id || r.fact?.workspace_id;
      if (!wsId) return false;
      const normalizeWsId = (id: string) => id.includes('/') ? id : `workspaces/${id}`;
      return normalizeWsId(wsId) === normalizeWsId(ctx.workspaceId!);
    });

    return {
      outgoing: filterByWorkspace(outgoing).map((r) => ({
        relation: stripEmbeddings(r.relation),
        fact: stripEmbeddings(r.fact),
      })),
      incoming: filterByWorkspace(incoming).map((r) => ({
        relation: stripEmbeddings(r.relation),
        fact: stripEmbeddings(r.fact),
      })),
    };
  });

  // SECURITY: Raw AQL query endpoint DISABLED
  // This endpoint allowed arbitrary database queries without authorization.
  // It has been disabled to prevent cross-tenant data access and SQL injection-like attacks.
  // If you need this functionality, implement specific endpoints with proper authorization.
  server.post("/api/query", async (request, reply) => {
    reply.code(403);
    return {
      error: "This endpoint has been disabled for security reasons",
      message: "Raw AQL queries are no longer permitted. Use specific API endpoints instead.",
    };
  });

  server.get("/api/knowledge-cards", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const { limit = 50, offset = 0 } = request.query as any;

    const cards = await KnowledgeCard.list(ctx.workspaceId, limit, offset);
    return { cards: stripEmbeddingsArray(cards) };
  });

  server.get("/api/knowledge-cards/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const card = await KnowledgeCard.findById(id);

    if (!card) {
      reply.code(404);
      return { error: "Knowledge card not found" };
    }

    // SECURITY: Verify card belongs to user's workspace
    const hasAccess = await requireWorkspaceOwnership(card.workspace_id, ctx, reply, "Knowledge card");
    if (!hasAccess) return;

    return { card: stripEmbeddings(card) };
  });

  server.post("/api/knowledge-cards", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const body = request.body as any;
    const workspaceId = body.workspace_id || ctx.workspaceId;
    if (!workspaceId) {
      reply.code(400);
      return { error: "workspace_id is required or must be inferred from auth" };
    }
    const createdBy = body.created_by || ctx.userId;
    const lastUpdatedBy = body.last_updated_by || ctx.userId || body.created_by;
    if (!createdBy || !lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for writes" };
    }

    const card = await KnowledgeCard.create({
      title: body.title,
      summary: body.summary,
      content: body.content,
      fact_ids: body.fact_ids || [],
      workspace_id: workspaceId,
      created_by: createdBy,
      last_updated_by: lastUpdatedBy,
      metadata: body.metadata,
    });

    // Queue embedding generation for the card
    try {
      await collections.worker_triggers.save({
        worker_name: "embeddings-generator",
        status: "pending",
        created_at: new Date().toISOString(),
        metadata: {
          type: "card",
          id: card.id,
          workspace_id: workspaceId,
        },
      });
    } catch (triggerError: any) {
      // Non-fatal: sweep will catch it within 10 minutes
      console.error("Failed to queue card embedding trigger:", triggerError.message);
    }

    return { card: stripEmbeddings(card) };
  });

  server.put("/api/knowledge-cards/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const body = request.body as any;
    const lastUpdatedBy = body.last_updated_by || ctx.userId;
    if (!lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for updates" };
    }

    // SECURITY: Verify card exists and belongs to user's workspace
    const existingCard = await KnowledgeCard.findById(id);
    if (!existingCard) {
      reply.code(404);
      return { error: "Knowledge card not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(existingCard.workspace_id, ctx, reply, "Knowledge card");
    if (!hasAccess) return;

    const card = await KnowledgeCard.update({
      id,
      title: body.title,
      summary: body.summary,
      content: body.content,
      fact_ids: body.fact_ids,
      metadata: body.metadata,
      last_updated_by: lastUpdatedBy,
    });

    return { card: stripEmbeddings(card) };
  });

  server.post("/api/knowledge-cards/search", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const body = request.body as any;
    const hits = await searchKnowledgeCards({
      query: body.query || "*",
      workspace_id: ctx.workspaceId,
      k: body.k || 5,
      offset: body.offset || 0,
      use_vector_search: body.use_vector_search,
    });
    return {
      hits: hits.map((hit) => ({
        ...hit,
        card: stripEmbeddings(hit.card),
      })),
    };
  });

  server.post("/api/knowledge-cards/split", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const body = request.body as any;
    const createdBy = body.created_by || ctx.userId;
    const lastUpdatedBy = body.last_updated_by || ctx.userId || body.created_by;
    if (!createdBy || !lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for this operation" };
    }
    const workspaceId = body.workspace_id || ctx.workspaceId;
    if (!workspaceId) {
      reply.code(400);
      return { error: "workspace_id is required or must be inferred from auth" };
    }

    const result = await splitKnowledgeCard({
      id: body.id,
      num_cards: body.num_cards,
      created_by: createdBy,
      last_updated_by: lastUpdatedBy,
      workspace_id: workspaceId,
    });

    return stripEmbeddingsDeep(result);
  });

  server.post("/api/knowledge-cards/combine", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const body = request.body as any;
    const createdBy = body.created_by || ctx.userId;
    const lastUpdatedBy = body.last_updated_by || ctx.userId || body.created_by;
    if (!createdBy || !lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for this operation" };
    }
    const workspaceId = body.workspace_id || ctx.workspaceId;
    if (!workspaceId) {
      reply.code(400);
      return { error: "workspace_id is required or must be inferred from auth" };
    }

    const result = await combineKnowledgeCards({
      card_ids: body.card_ids || [],
      created_by: createdBy,
      last_updated_by: lastUpdatedBy,
      workspace_id: workspaceId,
    });

    return stripEmbeddingsDeep(result);
  });

  server.delete("/api/knowledge-cards/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const deletedBy = ctx.userId || (request.query as any)?.deleted_by;
    if (!deletedBy) {
      reply.code(401);
      return { error: "User ID is required for deletes" };
    }

    // SECURITY: Verify card exists and belongs to user's workspace
    const existingCard = await KnowledgeCard.findById(id);
    if (!existingCard) {
      reply.code(404);
      return { error: "Knowledge card not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(existingCard.workspace_id, ctx, reply, "Knowledge card");
    if (!hasAccess) return;

    try {
      await KnowledgeCard.delete(id, deletedBy);
      return { success: true };
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  });

  server.get("/api/webhooks", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const { active_only = false } = request.query as any;
    const webhooks = await Webhook.list(
      ctx.workspaceId,
      active_only === "true",
    );
    return { webhooks };
  });

  server.post("/api/webhooks", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const body = request.body as any;
    const createdBy = body.created_by || ctx.userId;
    if (!createdBy) {
      reply.code(401);
      return { error: "User ID is required for writes" };
    }
    const webhook = await Webhook.create({
      url: body.url,
      events: body.events || [],
      secret: body.secret,
      active: body.active !== undefined ? body.active : true,
      workspace_id: ctx.workspaceId!,
      created_by: createdBy,
    });

    return { webhook };
  });

  server.put("/api/webhooks/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };
    const body = request.body as any;

    // SECURITY: Verify webhook exists and belongs to user's workspace
    const existingWebhook = await Webhook.findById(id);
    if (!existingWebhook) {
      reply.code(404);
      return { error: "Webhook not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(existingWebhook.workspace_id, ctx, reply, "Webhook");
    if (!hasAccess) return;

    const webhook = await Webhook.update({
      id,
      url: body.url,
      events: body.events,
      secret: body.secret,
      active: body.active,
    });

    return { webhook };
  });

  server.delete("/api/webhooks/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;

    const { id } = request.params as { id: string };

    // SECURITY: Verify webhook exists and belongs to user's workspace
    const existingWebhook = await Webhook.findById(id);
    if (!existingWebhook) {
      reply.code(404);
      return { error: "Webhook not found" };
    }
    const hasAccess = await requireWorkspaceOwnership(existingWebhook.workspace_id, ctx, reply, "Webhook");
    if (!hasAccess) return;

    await Webhook.delete(id);
    return { success: true };
  });

  return server;
}
