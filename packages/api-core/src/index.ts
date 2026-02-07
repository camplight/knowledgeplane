import {
  Fact,
  KnowledgeCard,
  WorkspaceMember,
  collections,
  generateQueryEmbedding,
  cosineSimilarity,
  type KnowledgeCardRecord,
} from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";
import type { ChatMessage, ChatCompletionOptions } from "@knowledgeplane/aimodel";

type KnowledgeCardSearchResult = {
  card: KnowledgeCardRecord;
  score: number;
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
  k?: number;
  offset?: number;
  include_trashed?: boolean;
}) {
  const provider = getProvider();
  const limit = Math.min(args.k || 5, 20);
  const maxContentLength = 500;

  const hits = await Fact.search({
    query: args.query,
    workspace_id: args.workspace_id,
    k: limit,
    offset: args.offset,
    include_trashed: args.include_trashed,
    use_vector_search: undefined,
    embeddingProvider: provider,
  });

  const optimizedHits = hits.map((hit) => {
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
    note: optimizedHits.some((h) => h.content_truncated)
      ? "Some facts have truncated content. Fetch the fact by ID for full content."
      : undefined,
  };
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
    model:
      process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || "gpt-4o",
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
    model:
      process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || "gpt-4o",
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
