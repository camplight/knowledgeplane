import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact, KnowledgeCard, FactRelation, WorkspaceMember } from "@knowledgeplane/db";
import { stripEmbeddings } from "./strip-embeddings.js";
import { createAIModelClient, getChatModel } from "@knowledgeplane/aimodel";
import type { ChatMessage, ChatCompletionOptions } from "@knowledgeplane/aimodel";

export const factsConsolidateTool: Tool = {
  name: "facts_consolidate",
  description:
    "Consolidate a set of facts into a knowledge card. Uses AI to analyze relationships and create a comprehensive knowledge card. Optionally includes related facts via graph traversal.",
  inputSchema: {
    type: "object",
    properties: {
      fact_ids: {
        type: "array",
        items: { type: "string" },
        description: "Array of fact IDs to consolidate",
      },
      include_related: {
        type: "boolean",
        description:
          "If true, includes related facts via graph traversal (default: false)",
      },
      created_by: {
        type: "string",
        description: "User ID of the creator (optional, inferred from session if authenticated)",
      },
      last_updated_by: {
        type: "string",
        description: "User ID of the last updater (optional, inferred from session if authenticated)",
      },
    },
    required: ["fact_ids"],
  },
};

export async function handleFactsConsolidate(args: {
  fact_ids: string[];
  include_related?: boolean;
  created_by?: string;
  last_updated_by?: string;
  workspace_id?: string;
}) {
  if (!args.created_by || !args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide created_by and last_updated_by, or authenticate via session.",
    );
  }

  if (args.fact_ids.length === 0) {
    throw new Error("At least one fact ID is required");
  }

  // Get the seed facts
  const seedFacts = await Promise.all(
    args.fact_ids.map((id) => Fact.findById(id)),
  );
  const validSeedFacts = seedFacts.filter((f) => f !== null && !f.trashed) as any[];

  if (validSeedFacts.length === 0) {
    throw new Error("No valid facts found");
  }

  // Validate that all facts belong to the same workspace
  const workspaceIds = new Set(validSeedFacts.map((f) => f.workspace_id));
  if (workspaceIds.size > 1) {
    throw new Error("All facts must belong to the same workspace");
  }

  const factWorkspaceId = validSeedFacts[0].workspace_id;

  // Validate workspace_id (should be set from context) - map to workspace_id
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (factWorkspaceId !== args.workspace_id) {
    throw new Error("Facts do not belong to the specified workspace");
  }

  // Validate workspace membership
  const member = await WorkspaceMember.findByWorkspaceAndUser(factWorkspaceId, args.last_updated_by);
  if (!member) {
    throw new Error("You are not a member of this workspace");
  }

  // Get related facts if requested
  let allFacts = [...validSeedFacts];
  if (args.include_related) {
    const relatedFacts = await getRelatedFacts(validSeedFacts);
    // Deduplicate facts
    const factMap = new Map<string, any>();
    for (const fact of [...validSeedFacts, ...relatedFacts]) {
      factMap.set(fact.id, fact);
    }
    allFacts = Array.from(factMap.values());
  }

  // Use AI to consolidate
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY,
  );
  const provider = client.getProvider();

  const factContents = allFacts.map((f) => `- ${f.content}`).join("\n");

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
    model: getChatModel(),
    temperature: 0.7,
    responseFormat: "json_object",
  };

  const response = await provider.chatCompletion(messages, chatOptions);

  if (!response.content) {
    throw new Error("No response from AI model");
  }

  const parsed = JSON.parse(response.content);

  // Create the knowledge card
  const knowledgeCard = await KnowledgeCard.create({
    title: parsed.title || "Untitled Card",
    summary: parsed.summary || "",
    content: parsed.content || "",
    fact_ids: allFacts.map((f) => f.id),
    workspace_id: factWorkspaceId,
    created_by: args.created_by!,
    last_updated_by: args.last_updated_by!,
    metadata: {
      consolidated_from: args.fact_ids,
      consolidated_at: new Date().toISOString(),
      include_related: args.include_related || false,
    },
  });
  const sanitizedCard = stripEmbeddings(knowledgeCard);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ card: sanitizedCard }, null, 2),
      },
    ],
  };
}

async function getRelatedFacts(seedFacts: any[]): Promise<any[]> {
  // Use graph traversal to find related facts via FactRelations
  const factIds = seedFacts.map((f) => f.id);
  const allRelated: Set<string> = new Set(factIds);

  for (const fact of seedFacts) {
    const factId = fact.id;
    const outgoing = await FactRelation.getRelatedFacts(factId);
    const incoming = await FactRelation.getIncomingRelations(factId);

    for (const rel of outgoing) {
      allRelated.add(rel.fact.id);
    }
    for (const rel of incoming) {
      allRelated.add(rel.fact.id);
    }
  }

  // Fetch all related facts
  const relatedFacts: any[] = [];
  for (const factId of allRelated) {
    const fact = await Fact.findById(factId);
    if (fact && !fact.trashed) {
      relatedFacts.push(fact);
    }
  }

  return relatedFacts;
}

