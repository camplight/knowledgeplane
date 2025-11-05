import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";

export const factsWriteTool: Tool = {
  name: "facts.write",
  description: "Write a fact to the knowledge base",
  inputSchema: {
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
};

export async function handleFactsWrite(args: {
  content: string;
  metadata?: Record<string, string>;
  created_by?: string;
  last_updated_by?: string;
  knowledge_context?: string;
}) {
  // Validate that user IDs are provided (either from args or should be inferred from context)
  if (!args.created_by || !args.last_updated_by) {
    throw new Error("User ID is required. Either provide created_by and last_updated_by, or authenticate via session.");
  }

  const fact = await Fact.write({
    content: args.content,
    metadata: args.metadata,
    created_by: args.created_by,
    last_updated_by: args.last_updated_by,
    knowledge_context: args.knowledge_context || "",
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ fact }, null, 2),
      },
    ],
  };
}
