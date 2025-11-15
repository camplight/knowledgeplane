import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { init, Fact, Relation, Card, Category, Webhook, User } from "@knowledgeplane/db";
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
  const { limit = 50, offset = 0, knowledge_context, include_trashed = false } = request.query as any;
  
  if (knowledge_context) {
    const results = await Fact.search({
      query: "*",
      knowledge_context,
      k: limit,
      offset,
      include_trashed: include_trashed === "true",
    });
    return { facts: results };
  }
  
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
    knowledge_context: body.knowledge_context,
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
    knowledge_context: body.knowledge_context,
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
    knowledge_context: body.knowledge_context,
    k: body.k || 10,
    offset: body.offset || 0,
    include_trashed: body.include_trashed || false,
  });
  
  return { results };
});

// Relations endpoints
server.get("/api/relations", async (request, reply) => {
  const { from_fact, to_fact, type, limit = 50, offset = 0 } = request.query as any;
  
  const relations = await Relation.query({
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
  const relation = await Relation.create({
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
  
  const outgoing = await Relation.getRelatedFacts(id, type);
  const incoming = await Relation.getIncomingRelations(id, type);
  
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

// Cards endpoints
server.get("/api/cards", async (request, reply) => {
  const { limit = 50, offset = 0, knowledge_context, category_id } = request.query as any;
  
  const cards = await Card.list(limit, offset, knowledge_context, category_id);
  return { cards };
});

server.get("/api/cards/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const card = await Card.findById(id);
  
  if (!card) {
    reply.code(404);
    return { error: "Card not found" };
  }
  
  return { card };
});

// Categories endpoints
server.get("/api/categories", async (request, reply) => {
  const { knowledge_context, parent_id } = request.query as any;
  
  const categories = await Category.list(knowledge_context, parent_id);
  return { categories };
});

server.get("/api/categories/tree", async (request, reply) => {
  const { knowledge_context } = request.query as any;
  
  const tree = await Category.getTree(knowledge_context);
  return { tree };
});

server.get("/api/categories/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const category = await Category.findById(id);
  
  if (!category) {
    reply.code(404);
    return { error: "Category not found" };
  }
  
  return { category };
});

server.post("/api/categories", async (request, reply) => {
  const body = request.body as any;
  const category = await Category.create({
    name: body.name,
    description: body.description,
    parent_id: body.parent_id,
    knowledge_context: body.knowledge_context,
    created_by: body.created_by || "system",
  });
  
  return { category };
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

server.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`REST API server listening on ${address}`);
});

