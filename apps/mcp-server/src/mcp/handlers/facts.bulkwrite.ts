import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";

export const factsBulkWriteTool: Tool = {
  name: "facts.bulkwrite",
  description: "Write multiple facts to the knowledge base in a single operation",
  inputSchema: {
    type: "object",
    properties: {
      facts: {
        type: "array",
        description: "Array of fact objects to write",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "The content of the fact" },
            metadata: {
              type: "object",
              description: "Key-value pairs of metadata",
              additionalProperties: { type: "string" },
            },
            created_by: { type: "string", description: "User ID of the creator (optional, inferred from session if authenticated)" },
            last_updated_by: { type: "string", description: "User ID of the last updater (optional, inferred from session if authenticated)" },
            knowledge_context: { type: "string", description: "Context or namespace for organizing facts" },
          },
          required: ["content"],
        },
      },
    },
    required: ["facts"],
  },
};

export async function handleFactsBulkWrite(args: {
  facts: Array<{
    content: string;
    metadata?: Record<string, string>;
    created_by?: string;
    last_updated_by?: string;
    knowledge_context?: string;
  }>;
}) {
  // Validate that facts array is not empty
  if (!args.facts || args.facts.length === 0) {
    throw new Error("At least one fact is required");
  }

  // Validate that user IDs are provided (should be merged from context by server.ts)
  const hasUserIds = args.facts.every(
    (fact) => fact.created_by && fact.last_updated_by,
  );

  if (!hasUserIds) {
    throw new Error(
      "User ID is required for all facts. Either provide created_by and last_updated_by for each fact, or authenticate via session.",
    );
  }

  // Prepare fact inputs for bulk write
  const factInputs = args.facts.map((fact) => ({
    content: fact.content,
    metadata: fact.metadata,
    created_by: fact.created_by!,
    last_updated_by: fact.last_updated_by!,
    knowledge_context: fact.knowledge_context || "",
  }));

  const facts = await Fact.bulkWrite(factInputs);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ facts, count: facts.length }, null, 2),
      },
    ],
  };
}

