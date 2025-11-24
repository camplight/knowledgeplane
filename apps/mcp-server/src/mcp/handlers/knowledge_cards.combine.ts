import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard, Fact, TeamMember } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";
import type { ChatMessage, ChatCompletionOptions } from "@knowledgeplane/aimodel";

export const knowledgeCardsCombineTool: Tool = {
  name: "knowledge_cards.combine",
  description:
    "Combine multiple knowledge cards into a single card. Uses AI to intelligently merge the content and facts.",
  inputSchema: {
    type: "object",
    properties: {
      card_ids: {
        type: "array",
        items: { type: "string" },
        description: "Array of knowledge card IDs to combine",
      },
      created_by: {
        type: "string",
        description: "User ID of the creator (optional, inferred from session if authenticated)",
      },
      last_updated_by: {
        type: "string",
        description: "User ID of the last updater (optional, inferred from session if authenticated)",
      },
      team_id: {
        type: "string",
        description: "Team ID for validation (optional, inferred from session if authenticated)",
      },
    },
    required: ["card_ids"],
  },
};

export async function handleKnowledgeCardsCombine(args: {
  card_ids: string[];
  created_by?: string;
  last_updated_by?: string;
  team_id?: string;
}) {
  if (!args.created_by || !args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide created_by and last_updated_by, or authenticate via session.",
    );
  }

  if (args.card_ids.length < 2) {
    throw new Error("At least 2 cards are required to combine");
  }

  // Get all the cards to combine
  const cards = await Promise.all(
    args.card_ids.map((id) => KnowledgeCard.findById(id)),
  );

  const validCards = cards.filter((c) => c !== null) as any[];
  if (validCards.length !== args.card_ids.length) {
    throw new Error("One or more cards not found");
  }

  // Validate that all cards belong to the same team
  const teamIds = new Set(validCards.map((c) => c.team_id));
  if (teamIds.size > 1) {
    throw new Error("All cards must belong to the same team");
  }

  const cardTeamId = validCards[0].team_id;

  // Validate team_id if provided
  if (args.team_id) {
    if (cardTeamId !== args.team_id) {
      throw new Error("Cards do not belong to the specified team");
    }
  }

  // Validate team membership
  const member = await TeamMember.findByTeamAndUser(cardTeamId, args.last_updated_by);
  if (!member) {
    throw new Error("You are not a member of this team");
  }

  // Collect all unique fact IDs
  const allFactIds = new Set<string>();
  for (const card of validCards) {
    for (const factId of card.fact_ids) {
      allFactIds.add(factId);
    }
  }

  // Get all facts
  const facts = await Promise.all(
    Array.from(allFactIds).map((factId) => Fact.findById(factId)),
  );
  const validFacts = facts.filter((f) => f !== null) as any[];

  // Use AI to combine the cards
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY,
  );
  const provider = client.getProvider();

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

  // Create the combined card
  const combinedCard = await KnowledgeCard.create({
    title: parsed.title || "Combined Card",
    summary: parsed.summary || "",
    content: parsed.content || "",
    fact_ids: Array.from(allFactIds),
    team_id: cardTeamId,
    created_by: args.created_by!,
    last_updated_by: args.last_updated_by!,
    metadata: {
      combined_from: args.card_ids,
      combined_at: new Date().toISOString(),
    },
  });

  // Delete the original cards
  for (const cardId of args.card_ids) {
    await KnowledgeCard.delete(cardId);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            original_card_ids: args.card_ids,
            combined_card: combinedCard,
          },
          null,
          2,
        ),
      },
    ],
  };
}

