import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { init, Fact, FactRelation, KnowledgeCard, Webhook, User } from "@knowledgeplane/db";
import { collections } from "@knowledgeplane/db";

const server = Fastify({ logger: true });

// Register CORS
await server.register(cors, {
  origin: true,
});

// Initialize database
await init();

// Health check
server.get("/health", async () => {
  return { status: "ok" };
});

// Facts endpoints
server.get("/api/facts", async (request, reply) => {
  const { limit = 50, offset = 0, include_trashed = false } = request.query as any;
  
  const facts = await Fact.list(limit, offset, include_trashed === "true");
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
  const body = request.body as any;
  const fact = await Fact.write({
    content: body.content,
    metadata: body.metadata,
    created_by: body.created_by || "system",
    last_updated_by: body.last_updated_by || body.created_by || "system",
  });
  
  return { fact };
});

server.put("/api/facts/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  
  const fact = await Fact.update({
    id,
    content: body.content,
    metadata: body.metadata,
    last_updated_by: body.last_updated_by || "system",
  });
  
  return { fact };
});

server.delete("/api/facts/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { last_updated_by = "system" } = request.query as any;
  
  const fact = await Fact.trash(id, last_updated_by);
  return { fact };
});

server.post("/api/facts/search", async (request, reply) => {
  const body = request.body as any;
  const results = await Fact.search({
    query: body.query || "*",
    k: body.k || 10,
    offset: body.offset || 0,
    include_trashed: body.include_trashed || false,
  });
  
  return { results };
});

// Relations endpoints
server.get("/api/relations", async (request, reply) => {
  const { from_fact, to_fact, type, limit = 50, offset = 0 } = request.query as any;
  
  const relations = await FactRelation.query({
    from_fact,
    to_fact,
    type,
    limit,
    offset,
  });
  
  return { relations };
});

server.post("/api/relations", async (request, reply) => {
  const body = request.body as any;
  const relation = await FactRelation.create({
    from_fact: body.from_fact,
    to_fact: body.to_fact,
    type: body.type,
    metadata: body.metadata,
    created_by: body.created_by || "system",
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

// AQL query endpoint
server.post("/api/query", async (request, reply) => {
  const { query, bindVars } = request.body as { query: string; bindVars?: any };
  
  if (!query) {
    reply.code(400);
    return { error: "Query is required" };
  }
  
  try {
    const cursor = await collections.facts.database.query(query, bindVars || {});
    const results = await cursor.all();
    return { results };
  } catch (error: any) {
    reply.code(400);
    return { error: error.message };
  }
});

// Knowledge Cards endpoints
server.get("/api/knowledge-cards", async (request, reply) => {
  const { limit = 50, offset = 0 } = request.query as any;
  
  const cards = await KnowledgeCard.list(limit, offset);
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


// Webhooks endpoints
server.get("/api/webhooks", async (request, reply) => {
  const { active_only = false } = request.query as any;
  const webhooks = await Webhook.list(active_only === "true");
  return { webhooks };
});

server.post("/api/webhooks", async (request, reply) => {
  const body = request.body as any;
  const webhook = await Webhook.create({
    url: body.url,
    events: body.events || [],
    secret: body.secret,
    active: body.active !== undefined ? body.active : true,
    created_by: body.created_by || "system",
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

const port = parseInt(process.env.PORT || "8081", 10);
const host = process.env.HOST || "0.0.0.0";

try {
  const address = await server.listen({ port, host });
  console.log(`REST API server listening on ${address}`);
} catch (err) {
  console.error("Failed to start server:", err);
  process.exit(1);
}

