import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard, Fact, TeamMember } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";
import type { ChatMessage, ChatCompletionOptions } from "@knowledgeplane/aimodel";

export const knowledgeCardsSplitTool: Tool = {
  name: "knowledge_cards.split",
  description:
    "Split a knowledge card into multiple cards. Uses AI to intelligently divide the content and facts into separate cards.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the knowledge card to split",
      },
      num_cards: {
        type: "number",
        description: "Number of cards to split into (default: 2)",
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
    required: ["id"],
  },
};

export async function handleKnowledgeCardsSplit(args: {
  id: string;
  num_cards?: number;
  created_by?: string;
  last_updated_by?: string;
  team_id?: string;
}) {
  if (!args.created_by || !args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide created_by and last_updated_by, or authenticate via session.",
    );
  }

  const numCards = args.num_cards || 2;

  // Get the original card
  const originalCard = await KnowledgeCard.findById(args.id);
  if (!originalCard) {
    throw new Error(`Knowledge card with id ${args.id} not found`);
  }

  // Validate team_id if provided
  if (args.team_id) {
    if (originalCard.team_id !== args.team_id) {
      throw new Error("Knowledge card does not belong to the specified team");
    }
  }

  // Validate team membership
  const member = await TeamMember.findByTeamAndUser(originalCard.team_id, args.last_updated_by);
  if (!member) {
    throw new Error("You are not a member of this team");
  }

  // Get the facts associated with the card
  const facts = await Promise.all(
    originalCard.fact_ids.map((factId) => Fact.findById(factId)),
  );
  const validFacts = facts.filter((f) => f !== null) as any[];

  // Use AI to split the card
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY,
  );
  const provider = client.getProvider();

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

  // Create the new cards
  const newCards = [];
  for (const cardInfo of cardData) {
    const newCard = await KnowledgeCard.create({
      title: cardInfo.title || "Untitled Card",
      summary: cardInfo.summary || "",
      content: cardInfo.content || "",
      fact_ids: cardInfo.fact_ids || [],
      team_id: originalCard.team_id,
      created_by: args.created_by!,
      last_updated_by: args.last_updated_by!,
      metadata: {
        ...originalCard.metadata,
        split_from: args.id,
        split_at: new Date().toISOString(),
      },
    });
    newCards.push(newCard);
  }

  // Delete the original card
  await KnowledgeCard.delete(args.id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            original_card_id: args.id,
            new_cards: newCards,
          },
          null,
          2,
        ),
      },
    ],
  };
}

