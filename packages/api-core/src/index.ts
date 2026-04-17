import {
  Fact,
  FactRelation,
  KnowledgeCard,
  WorkspaceMember,
  collections,
  generateQueryEmbedding,
  cosineSimilarity,
  type KnowledgeCardRecord,
} from "@knowledgeplane/db";
import { createAIModelClient, getChatModel } from "@knowledgeplane/aimodel";
import type { ChatMessage, ChatCompletionOptions } from "@knowledgeplane/aimodel";

type KnowledgeCardSearchResult = {
  card: KnowledgeCardRecord;
  score: number;
};

type FactHit = Awaited<ReturnType<typeof Fact.search>>[number];
type GraphPlan = {
  expandedQuery: string;
  relationTypes: string[];
};

function getProvider() {
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY,
  );
  return client.getProvider();
}

export async function searchFacts(args: {
  query: string;
  workspace_id?: string;
  namespace?: string;
  k?: number;
  offset?: number;
  include_trashed?: boolean;
}) {
  const provider = getProvider();
  const limit = Math.min(args.k || 5, 100);  // Allow up to 100 for benchmarks
  const maxContentLength = 500;
  const offset = args.offset || 0;
  const seedWindow = Math.min(Math.max(limit * 3, 12), 120);
  const dreamQueries = buildDreamQueries(args.query);
  const perQueryWindow = Math.max(8, Math.floor(seedWindow / Math.max(1, dreamQueries.length)));
  const variantHitLists = await Promise.all(
    dreamQueries.map((q) =>
      Fact.search({
        query: q,
        workspace_id: args.workspace_id,
        namespace: args.namespace,
        k: perQueryWindow,
        offset: 0,
        include_trashed: args.include_trashed,
        use_vector_search: undefined,
        embeddingProvider: provider,
      }),
    ),
  );
  const seedHits = fuseDreamHitLists(args.query, variantHitLists, seedWindow);

  const graphEnabled = shouldUseGraphExpansion(args.query, seedHits);
  const graphPlan = graphEnabled
    ? await buildGraphQueryPlan(args.query, seedHits, provider)
    : { expandedQuery: args.query, relationTypes: ["related_to"] };
  const graphExpandedHits = graphEnabled
    ? await getGraphExpandedHits({
        seedHits,
        relationTypes: graphPlan.relationTypes,
        workspaceId: args.workspace_id,
        namespace: args.namespace,
        includeTrashed: args.include_trashed,
        queryForFilter: graphPlan.expandedQuery || args.query,
      })
    : [];

  const allCandidates = graphEnabled
    ? fuseFactCandidates(
        args.query,
        seedHits,
        graphExpandedHits,
        limit + offset,
      ).slice(offset, offset + limit)
    : seedHits.slice(offset, offset + limit);

  await logRetrievalTrace({
    query: args.query,
    workspace_id: args.workspace_id,
    namespace: args.namespace,
    graph_enabled: graphEnabled,
    seed_count: seedHits.length,
    graph_count: graphExpandedHits.length,
    result_count: allCandidates.length,
    top_score: allCandidates[0]?.score ?? 0,
  });

  const optimizedHits = allCandidates.map((hit) => {
    const { embedding, embedding_model, _key, _id, ...rest } = hit;
    const content =
      rest.content.length > maxContentLength
        ? rest.content.substring(0, maxContentLength) + "..."
        : rest.content;
    return {
      ...rest,
      content,
      content_truncated: hit.content.length > maxContentLength,
    };
  });

  return {
    hits: optimizedHits,
    total_returned: optimizedHits.length,
    limit_used: limit,
    graph_enriched: graphEnabled,
    graph_query: graphPlan.expandedQuery,
    note: optimizedHits.some((h) => h.content_truncated)
      ? "Some facts have truncated content. Fetch the fact by ID for full content."
      : undefined,
  };
}

async function buildGraphQueryPlan(
  query: string,
  seedHits: FactHit[],
  provider: ReturnType<typeof getProvider>,
): Promise<GraphPlan> {
  const fallbackTerms = tokenizeQueryTerms(query).slice(0, 8);
  const seedTerms = seedHits
    .slice(0, 5)
    .flatMap((h) => tokenizeQueryTerms(h.content))
    .slice(0, 12);
  const fallbackExpanded = Array.from(new Set([...fallbackTerms, ...seedTerms])).join(" ");
  const fallbackPlan: GraphPlan = {
    expandedQuery: fallbackExpanded || query,
    relationTypes: ["related_to"],
  };

  const aiPlannerEnabled = process.env.GRAPH_QUERY_PLANNER_AI === "true";
  if (!aiPlannerEnabled || !process.env.OPENAI_API_KEY || seedHits.length === 0) {
    return fallbackPlan;
  }

  try {
    const seedContext = seedHits
      .slice(0, 4)
      .map((h, i) => `hit_${i + 1}: ${h.content.slice(0, 220)}`)
      .join("\n");

    const response = await provider.chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a retrieval query planner. Return compact JSON only.",
        },
        {
          role: "user",
          content: [
            `query: ${query}`,
            "candidate relation types: related_to, depends_on, references, part_of",
            "Use the seed hits to propose graph traversal hints.",
            "Return JSON with keys expanded_query (string) and relation_types (array of strings, max 2).",
            "Seed hits:",
            seedContext,
          ].join("\n"),
        },
      ],
      {
        model: getChatModel(),
        temperature: 0.1,
        responseFormat: "json_object",
      },
    );

    if (!response.content) {
      return fallbackPlan;
    }

    const parsed = JSON.parse(response.content);
    const expandedQuery = String(parsed.expanded_query || "").trim();
    const relationTypes = Array.isArray(parsed.relation_types)
      ? parsed.relation_types
          .map((t: unknown) => String(t).trim())
          .filter(Boolean)
          .slice(0, 2)
      : [];

    return {
      expandedQuery: expandedQuery || fallbackPlan.expandedQuery,
      relationTypes: relationTypes.length > 0 ? relationTypes : fallbackPlan.relationTypes,
    };
  } catch (error: any) {
    console.warn("Graph query planning failed, using fallback:", error.message);
    return fallbackPlan;
  }
}

async function getGraphExpandedHits(args: {
  seedHits: FactHit[];
  relationTypes: string[];
  workspaceId?: string;
  namespace?: string;
  includeTrashed?: boolean;
  queryForFilter: string;
}): Promise<FactHit[]> {
  const startMs = Date.now();
  const budgetMs = Math.max(
    20,
    parseInt(process.env.GRAPH_EXPANSION_BUDGET_MS || "120", 10),
  );
  const maxGraphCandidates = Math.max(
    8,
    parseInt(process.env.GRAPH_EXPANSION_MAX_CANDIDATES || "40", 10),
  );
  const relationTypes = args.relationTypes.length > 0 ? args.relationTypes : ["related_to"];
  const collected = new Map<string, FactHit>();
  const seedSubset = args.seedHits.slice(0, 3);
  const relationSubset = relationTypes.slice(0, 1);

  const tasks: Array<Promise<{ relation: any; fact: any }[]>> = [];
  for (const hit of seedSubset) {
    for (const relType of relationSubset) {
      tasks.push(FactRelation.getRelatedFacts(hit.id, relType));
    }
  }
  const allNeighborSets = await Promise.all(tasks);

  for (const neighbors of allNeighborSets) {
    for (const n of neighbors) {
      if (Date.now() - startMs > budgetMs) {
        return Array.from(collected.values()).slice(0, maxGraphCandidates);
      }
      const fact = n.fact;
      if (!fact || !fact.id) {
        continue;
      }
      if (args.workspaceId && fact.workspace_id !== args.workspaceId) {
        continue;
      }
      if (
        args.namespace &&
        (!fact.metadata || fact.metadata.namespace !== args.namespace)
      ) {
        continue;
      }
      if (!args.includeTrashed && (fact.trashed || fact.deleted_at)) {
        continue;
      }
      const overlap = lexicalOverlap(args.queryForFilter, fact.content);
      if (overlap < 0.15) {
        continue;
      }
      if (!collected.has(fact.id)) {
        collected.set(fact.id, {
          ...fact,
          score: 0.12 + overlap,
        } as FactHit);
        if (collected.size >= maxGraphCandidates) {
          return Array.from(collected.values());
        }
      }
    }
  }

  return Array.from(collected.values()).slice(0, maxGraphCandidates);
}

function tokenizeQueryTerms(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function lexicalOverlap(query: string, content: string): number {
  const q = new Set(tokenizeQueryTerms(query));
  if (q.size === 0) {
    return 0;
  }
  const c = new Set(tokenizeQueryTerms(content));
  let overlap = 0;
  for (const t of q) {
    if (c.has(t)) {
      overlap += 1;
    }
  }
  return overlap / q.size;
}

function fuseFactCandidates(
  query: string,
  seedHits: FactHit[],
  graphHits: FactHit[],
  window: number,
): FactHit[] {
  const map = new Map<string, { fact: FactHit; seedRank?: number; graphRank?: number }>();
  for (let i = 0; i < seedHits.length; i++) {
    map.set(seedHits[i].id, { fact: seedHits[i], seedRank: i + 1 });
  }
  for (let i = 0; i < graphHits.length; i++) {
    const existing = map.get(graphHits[i].id);
    if (existing) {
      existing.graphRank = i + 1;
    } else {
      map.set(graphHits[i].id, { fact: graphHits[i], graphRank: i + 1 });
    }
  }

  const rrfK = 50;
  const scored = Array.from(map.values()).map((entry) => {
    const seed = entry.seedRank ? 1 / (rrfK + entry.seedRank) : 0;
    const graph = entry.graphRank ? 1 / (rrfK + entry.graphRank) : 0;
    const lexical = lexicalOverlap(query, entry.fact.content) * 0.08;
    const score = seed * 0.88 + graph * 0.12 + lexical;
    return { ...entry.fact, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, window);
}

function shouldUseGraphExpansion(query: string, seedHits: FactHit[]): boolean {
  if (seedHits.length === 0) {
    return false;
  }
  if (process.env.GRAPH_EXPANSION_ENABLED === "false") {
    return false;
  }
  const queryTokens = tokenizeQueryTerms(query);
  const isLikelyCompositional =
    /\b(and|both|before|after|between|connected|relation|related|caused|because|impact)\b/i.test(
      query,
    );
  const sparseTopRecall = seedHits
    .slice(0, 3)
    .some((h) => lexicalOverlap(query, h.content) < 0.22);

  // Confidence-based trigger: if top scores are flat, graph expansion may surface
  // missing bridge facts and reduce retrieval uncertainty.
  const top = seedHits.slice(0, 4).map((h) => h.score || 0);
  const scoreSpread = top.length >= 2 ? top[0] - top[top.length - 1] : 0;
  const uncertainRanking = scoreSpread < 0.12;

  return isLikelyCompositional || (queryTokens.length >= 6 && (sparseTopRecall || uncertainRanking));
}

async function logRetrievalTrace(trace: {
  query: string;
  workspace_id?: string;
  namespace?: string;
  graph_enabled: boolean;
  seed_count: number;
  graph_count: number;
  result_count: number;
  top_score: number;
}) {
  try {
    await collections.worker_logs.save({
      worker_name: "retrieval-engine",
      status: "completed",
      metadata: {
        type: "retrieval_trace",
        ...trace,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
  } catch {
    // Observability should never break retrieval.
  }
}

function buildDreamQueries(query: string): string[] {
  const base = query.trim();
  const variants = new Set<string>([base]);
  const tokens = tokenizeQueryTerms(base);
  if (tokens.length > 3) {
    variants.add(tokens.join(" "));
    variants.add(tokens.slice(0, Math.min(6, tokens.length)).join(" "));
  }
  if (/\bwho\b/i.test(base)) {
    variants.add(`${base} person identity biography`);
  }
  if (/\bwhen\b/i.test(base)) {
    variants.add(`${base} date year timeline`);
  }
  if (/\bwhere\b/i.test(base)) {
    variants.add(`${base} location place country city`);
  }

  // Generic decomposition query to improve recall on multi-facet queries.
  if (tokens.length >= 5) {
    variants.add(tokens.slice(0, Math.ceil(tokens.length / 2)).join(" "));
    variants.add(tokens.slice(Math.floor(tokens.length / 2)).join(" "));
  }
  return Array.from(variants).slice(0, 4);
}

function fuseDreamHitLists(
  originalQuery: string,
  hitLists: FactHit[][],
  window: number,
): FactHit[] {
  const rrfK = 40;
  const map = new Map<string, { fact: FactHit; score: number }>();
  for (const list of hitLists) {
    for (let i = 0; i < list.length; i++) {
      const hit = list[i];
      const rankScore = 1 / (rrfK + i + 1);
      const lexical = lexicalOverlap(originalQuery, hit.content) * 0.06;
      const existing = map.get(hit.id);
      const nextScore = rankScore + lexical;
      if (existing) {
        existing.score += nextScore;
      } else {
        map.set(hit.id, { fact: hit, score: nextScore });
      }
    }
  }
  const scored = Array.from(map.values())
    .map((entry) => ({ ...entry.fact, score: entry.score }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, window);
}

export async function searchKnowledgeCards(args: {
  query: string;
  workspace_id?: string;
  k?: number;
  offset?: number;
  use_vector_search?: boolean;
}): Promise<KnowledgeCardSearchResult[]> {
  const limit = args.k || 5;
  const offset = args.offset || 0;
  const isWildcard = args.query === "*";
  const provider = getProvider();

  if (args.use_vector_search === false || isWildcard) {
    return knowledgeCardsFullTextSearch(
      args.query,
      args.workspace_id,
      limit,
      offset,
    );
  }

  if (args.use_vector_search === true) {
    return knowledgeCardsVectorSearch(
      args.query,
      args.workspace_id,
      limit,
      offset,
      provider,
    );
  }

  return knowledgeCardsHybridSearch(
    args.query,
    args.workspace_id,
    limit,
    offset,
    provider,
  );
}

export async function splitKnowledgeCard(args: {
  id: string;
  num_cards?: number;
  created_by: string;
  last_updated_by: string;
  workspace_id: string;
}) {
  const numCards = args.num_cards || 2;
  const originalCard = await KnowledgeCard.findById(args.id);
  if (!originalCard) {
    throw new Error(`Knowledge card with id ${args.id} not found`);
  }
  if (originalCard.workspace_id !== args.workspace_id) {
    throw new Error("Knowledge card does not belong to the specified workspace");
  }

  const member = await WorkspaceMember.findByWorkspaceAndUser(
    originalCard.workspace_id,
    args.last_updated_by,
  );
  if (!member) {
    throw new Error("You are not a member of this workspace");
  }

  const facts = await Promise.all(
    originalCard.fact_ids.map((factId) => Fact.findById(factId)),
  );
  const validFacts = facts.filter((f) => f !== null) as any[];

  const provider = getProvider();
  const factContents = validFacts.map((f) => `- ${f.content}`).join("\n");
  const systemPrompt = `You are a knowledge organization agent. Your task is to split a knowledge card into ${numCards} separate, well-organized cards.

Each new card should:
1. Have a clear, descriptive title (max 100 characters)
2. Have a concise summary (2-3 sentences, max 200 characters)
3. Have comprehensive content that organizes and synthesizes the information
4. Reference the specific facts that belong to it

The split should be logical and maintain coherence. Each card should be self-contained but may reference concepts from other cards if needed.`;

  const userPrompt = `Please split the following knowledge card into ${numCards} separate cards:

Original Card:
Title: ${originalCard.title}
Summary: ${originalCard.summary}
Content: ${originalCard.content}

Associated Facts:
${factContents}

Provide your response as JSON with the following structure:
{
  "cards": [
    {
      "title": "Card title",
      "summary": "Brief summary",
      "content": "Full content",
      "fact_ids": ["fact_id_1", "fact_id_2"]
    },
    ...
  ]
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const chatOptions: ChatCompletionOptions = {
    model: getChatModel(),
    temperature: 0.7,
    responseFormat: "json_object",
  };

  const response = await provider.chatCompletion(messages, chatOptions);
  if (!response.content) {
    throw new Error("No response from AI model");
  }

  const parsed = JSON.parse(response.content);
  const cardData = parsed.cards || [];
  if (cardData.length === 0) {
    throw new Error("AI did not generate any cards");
  }

  const newCards = [];
  for (const cardInfo of cardData) {
    const newCard = await KnowledgeCard.create({
      title: cardInfo.title || "Untitled Card",
      summary: cardInfo.summary || "",
      content: cardInfo.content || "",
      fact_ids: cardInfo.fact_ids || [],
      workspace_id: originalCard.workspace_id,
      created_by: args.created_by,
      last_updated_by: args.last_updated_by,
      metadata: {
        ...originalCard.metadata,
        split_from: args.id,
        split_at: new Date().toISOString(),
      },
    });
    newCards.push(newCard);
  }

  await KnowledgeCard.delete(args.id, args.last_updated_by);

  return {
    success: true,
    original_card_id: args.id,
    new_cards: newCards,
  };
}

export async function combineKnowledgeCards(args: {
  card_ids: string[];
  created_by: string;
  last_updated_by: string;
  workspace_id: string;
}) {
  if (args.card_ids.length < 2) {
    throw new Error("At least 2 cards are required to combine");
  }

  const cards = await Promise.all(
    args.card_ids.map((id) => KnowledgeCard.findById(id)),
  );
  const validCards = cards.filter((c) => c !== null) as any[];
  if (validCards.length !== args.card_ids.length) {
    throw new Error("One or more cards not found");
  }

  const workspaceIds = new Set(validCards.map((c) => c.workspace_id));
  if (workspaceIds.size > 1) {
    throw new Error("All cards must belong to the same workspace");
  }
  const cardWorkspaceId = validCards[0].workspace_id;
  if (cardWorkspaceId !== args.workspace_id) {
    throw new Error("Cards do not belong to the specified workspace");
  }

  const member = await WorkspaceMember.findByWorkspaceAndUser(
    cardWorkspaceId,
    args.last_updated_by,
  );
  if (!member) {
    throw new Error("You are not a member of this workspace");
  }

  const allFactIds = new Set<string>();
  for (const card of validCards) {
    for (const factId of card.fact_ids) {
      allFactIds.add(factId);
    }
  }

  const facts = await Promise.all(
    Array.from(allFactIds).map((factId) => Fact.findById(factId)),
  );
  const validFacts = facts.filter((f) => f !== null) as any[];

  const provider = getProvider();
  const cardSummaries = validCards
    .map(
      (c) =>
        `Card: ${c.title}\nSummary: ${c.summary}\nContent: ${c.content}\nFact IDs: ${c.fact_ids.join(", ")}`,
    )
    .join("\n\n---\n\n");
  const factContents = validFacts.map((f) => `- ${f.content}`).join("\n");

  const systemPrompt = `You are a knowledge consolidation agent. Your task is to combine multiple knowledge cards into a single, well-organized card.

The combined card should:
1. Have a clear, descriptive title (max 100 characters) that captures the essence of all cards
2. Have a concise summary (2-3 sentences, max 200 characters) that synthesizes the key points
3. Have comprehensive content that organizes and synthesizes information from all cards
4. Remove redundancy while preserving important details
5. Reference all the facts from the original cards

The content should be well-structured and logically organized.`;

  const userPrompt = `Please combine the following knowledge cards into a single card:

${cardSummaries}

Associated Facts:
${factContents}

Provide your response as JSON with the following structure:
{
  "title": "Combined card title",
  "summary": "Brief summary",
  "content": "Full consolidated content"
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const chatOptions: ChatCompletionOptions = {
    model: getChatModel(),
    temperature: 0.7,
    responseFormat: "json_object",
  };

  const response = await provider.chatCompletion(messages, chatOptions);
  if (!response.content) {
    throw new Error("No response from AI model");
  }

  const parsed = JSON.parse(response.content);

  const combinedCard = await KnowledgeCard.create({
    title: parsed.title || "Combined Card",
    summary: parsed.summary || "",
    content: parsed.content || "",
    fact_ids: Array.from(allFactIds),
    workspace_id: cardWorkspaceId,
    created_by: args.created_by,
    last_updated_by: args.last_updated_by,
    metadata: {
      combined_from: args.card_ids,
      combined_at: new Date().toISOString(),
    },
  });

  for (const cardId of args.card_ids) {
    await KnowledgeCard.delete(cardId, args.last_updated_by);
  }

  return {
    success: true,
    original_card_ids: args.card_ids,
    combined_card: combinedCard,
  };
}

export { renderSkillMarkdown, type SkillRenderParams } from "./skill";

function normalizeCardRecord(doc: any): KnowledgeCardRecord {
  return {
    id: doc._id || `knowledge_cards/${doc._key}`,
    _key: doc._key,
    _id: doc._id,
    title: doc.title,
    summary: doc.summary,
    content: doc.content,
    fact_ids: doc.fact_ids || [],
    workspace_id: doc.workspace_id,
    created_by: doc.created_by,
    last_updated_by: doc.last_updated_by,
    created_by_worker: doc.created_by_worker || null,
    last_updated_by_worker: doc.last_updated_by_worker || null,
    deleted_by: doc.deleted_by || null,
    deleted_by_worker: doc.deleted_by_worker || null,
    deleted_at: doc.deleted_at || null,
    metadata: doc.metadata || {},
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

async function knowledgeCardsFullTextSearch(
  query: string,
  workspaceId: string | undefined,
  limit: number,
  offset: number,
): Promise<KnowledgeCardSearchResult[]> {
  const isWildcard = query === "*";
  let aql: string;
  const bindVars: any = { limit, offset };
  const filters: string[] = [];

  if (workspaceId) {
    filters.push(`card.workspace_id == @workspaceId`);
    bindVars.workspaceId = workspaceId;
  }
  filters.push(`card.deleted_at == null`);
  const filterClause =
    filters.length > 0 ? `FILTER ${filters.join(" && ")}` : "";

  if (isWildcard) {
    aql = `
      FOR card IN knowledge_cards
        ${filterClause}
        SORT card.updated_at DESC, card.created_at DESC
        LIMIT @offset, @limit
        RETURN { card: card, score: 1.0 }
    `;
  } else {
    aql = `
      FOR card IN FULLTEXT(knowledge_cards, "content", @query)
        ${filterClause}
        SORT card.updated_at DESC, card.created_at DESC
        LIMIT @offset, @limit
        RETURN { card: card, score: BM25(card) }
    `;
    bindVars.query = query;
  }

  try {
    const cursor = await collections.knowledge_cards.database.query(
      aql,
      bindVars,
    );
    const results = await cursor.all();
    return results.map((r: any) => ({
      card: normalizeCardRecord(r.card),
      score: r.score || 1.0,
    }));
  } catch (error: any) {
    if (error.errorNum === 1571 || error.message?.includes("fulltext index")) {
      console.warn("Fulltext index not found, falling back to LIKE search");
      const fallbackFilters: string[] = [];
      if (workspaceId) {
        fallbackFilters.push(`card.workspace_id == @workspaceId`);
      }
      fallbackFilters.push(`card.deleted_at == null`);
      fallbackFilters.push(`(LOWER(card.title) LIKE LOWER(CONCAT("%", @query, "%"))
             OR LOWER(card.summary) LIKE LOWER(CONCAT("%", @query, "%"))
             OR LOWER(card.content) LIKE LOWER(CONCAT("%", @query, "%")))`);
      const fallbackFilterClause =
        fallbackFilters.length > 0
          ? `FILTER ${fallbackFilters.join(" && ")}`
          : "";
      const fallbackAql = `
        FOR card IN knowledge_cards
          ${fallbackFilterClause}
          SORT card.updated_at DESC, card.created_at DESC
          LIMIT @offset, @limit
          RETURN { card: card, score: 1.0 }
      `;
      const fallbackCursor = await collections.knowledge_cards.database.query(
        fallbackAql,
        bindVars,
      );
      const fallbackResults = await fallbackCursor.all();
      return fallbackResults.map((r: any) => ({
        card: normalizeCardRecord(r.card),
        score: r.score || 1.0,
      }));
    }

    throw error;
  }
}

async function knowledgeCardsVectorSearch(
  query: string,
  workspaceId: string | undefined,
  limit: number,
  offset: number,
  provider: any,
): Promise<KnowledgeCardSearchResult[]> {
  if (!provider) {
    return knowledgeCardsFullTextSearch(query, workspaceId, limit, offset);
  }

  try {
    const queryEmbedding = await generateQueryEmbedding(query, provider);
    const filters: string[] = [`card.embedding != null`, `card.deleted_at == null`];
    const bindVars: any = {};
    if (workspaceId) {
      filters.push(`card.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }

    const aql = `
      FOR card IN knowledge_cards
        FILTER ${filters.join(" && ")}
        RETURN card
    `;

    const cursor = await collections.knowledge_cards.database.query(
      aql,
      bindVars,
    );
    const allCards = await cursor.all();

    return allCards
      .map((card: any) => {
        try {
          const score = cosineSimilarity(card.embedding, queryEmbedding);
          return {
            card: normalizeCardRecord(card),
            score,
          };
        } catch (error: any) {
          console.warn(
            `Skipping card ${card._id} due to embedding error:`,
            error.message,
          );
          return null;
        }
      })
      .filter(
        (r): r is KnowledgeCardSearchResult =>
          r !== null,
      )
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit);
  } catch (error: any) {
    console.error("Vector search error:", error.message);
    return knowledgeCardsFullTextSearch(query, workspaceId, limit, offset);
  }
}

async function knowledgeCardsHybridSearch(
  query: string,
  workspaceId: string | undefined,
  limit: number,
  offset: number,
  provider: any,
): Promise<KnowledgeCardSearchResult[]> {
  if (!provider) {
    return knowledgeCardsFullTextSearch(query, workspaceId, limit, offset);
  }

  try {
    const [fullTextResults, vectorResults] = await Promise.all([
      knowledgeCardsFullTextSearch(query, workspaceId, limit * 2, 0),
      knowledgeCardsVectorSearch(query, workspaceId, limit * 2, 0, provider),
    ]);

    const resultMap = new Map<string, { card: any; scores: number[] }>();

    for (const result of fullTextResults) {
      const normalizedScore = Math.min(result.score / 10, 1);
      resultMap.set(result.card.id, {
        card: result.card,
        scores: [normalizedScore],
      });
    }

    for (const result of vectorResults) {
      const existing = resultMap.get(result.card.id);
      if (existing) {
        existing.scores.push(result.score);
      } else {
        resultMap.set(result.card.id, {
          card: result.card,
          scores: [result.score],
        });
      }
    }

    const combinedResults = Array.from(resultMap.values()).map((item) => {
      const avgScore =
        item.scores.reduce((sum, s) => sum + s, 0) / item.scores.length;
      return {
        card: item.card,
        score: avgScore,
      };
    });

    combinedResults.sort((a, b) => b.score - a.score);
    return combinedResults.slice(offset, offset + limit);
  } catch (error: any) {
    console.error("Hybrid search error:", error.message);
    return knowledgeCardsFullTextSearch(query, workspaceId, limit, offset);
  }
}
