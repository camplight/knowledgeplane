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


type RequestContext = {
  userId?: string;
  workspaceId?: string;
  authContext?: AuthContext;
};

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

  let workspaceId = query.workspace_id as string | undefined;
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
    return { facts };
  });

  server.get("/api/facts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const fact = await Fact.findById(id);

    if (!fact) {
      reply.code(404);
      return { error: "Fact not found" };
    }

    return { fact };
  });

  server.post("/api/facts", async (request, reply) => {
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
    const fact = await Fact.write({
      content: body.content,
      metadata: body.metadata,
      workspace_id: workspaceId,
      created_by: createdBy,
      last_updated_by: lastUpdatedBy,
    });

    return { fact };
  });

  server.put("/api/facts/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const lastUpdatedBy = body.last_updated_by || ctx.userId;
    if (!lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for updates" };
    }

    const fact = await Fact.update({
      id,
      content: body.content,
      metadata: body.metadata,
      last_updated_by: lastUpdatedBy,
    });

    return { fact };
  });

  server.delete("/api/facts/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { last_updated_by } = request.query as any;
    const lastUpdatedBy = last_updated_by || ctx.userId;
    if (!lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for deletes" };
    }

    const fact = await Fact.trash(id, lastUpdatedBy);
    return { fact };
  });

  server.post("/api/facts/search", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const body = request.body as any;
    return searchFacts({
      query: body.query || "*",
      workspace_id: ctx.workspaceId,
      k: body.k || 10,
      offset: body.offset || 0,
      include_trashed: body.include_trashed || false,
    });
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

    return { relations };
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

    return { relation };
  });

  server.get("/api/facts/:id/relations", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type } = request.query as any;

    const outgoing = await FactRelation.getRelatedFacts(id, type);
    const incoming = await FactRelation.getIncomingRelations(id, type);

    return {
      outgoing,
      incoming,
    };
  });

  server.post("/api/query", async (request, reply) => {
    const { query, bindVars } = request.body as {
      query: string;
      bindVars?: any;
    };

    if (!query) {
      reply.code(400);
      return { error: "Query is required" };
    }

    try {
      const cursor = await collections.facts.database.query(
        query,
        bindVars || {},
      );
      const results = await cursor.all();
      return { results };
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  server.get("/api/knowledge-cards", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const workspaceError = requireWorkspace(ctx, reply);
    if (workspaceError) return workspaceError;
    const { limit = 50, offset = 0 } = request.query as any;

    const cards = await KnowledgeCard.list(ctx.workspaceId, limit, offset);
    return { cards };
  });

  server.get("/api/knowledge-cards/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const card = await KnowledgeCard.findById(id);

    if (!card) {
      reply.code(404);
      return { error: "Knowledge card not found" };
    }

    return { card };
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

    return { card };
  });

  server.put("/api/knowledge-cards/:id", async (request, reply) => {
    const ctx = await resolveContext(request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const lastUpdatedBy = body.last_updated_by || ctx.userId;
    if (!lastUpdatedBy) {
      reply.code(401);
      return { error: "User ID is required for updates" };
    }

    const card = await KnowledgeCard.update({
      id,
      title: body.title,
      summary: body.summary,
      content: body.content,
      fact_ids: body.fact_ids,
      metadata: body.metadata,
      last_updated_by: lastUpdatedBy,
    });

    return { card };
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
    return { hits };
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

    return result;
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

    return result;
  });

  server.delete("/api/knowledge-cards/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await KnowledgeCard.delete(id);
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
    const { id } = request.params as { id: string };
    const body = request.body as any;

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
    const { id } = request.params as { id: string };
    await Webhook.delete(id);
    return { success: true };
  });

  return server;
}
