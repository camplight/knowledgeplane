import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";

export const factsWriteTool: Tool = {
  name: "facts_write",
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
    },
    required: ["content"],
  },
};

export async function handleFactsWrite(args: {
  content: string;
  metadata?: Record<string, string>;
  workspace_id?: string;
  created_by?: string;
  last_updated_by?: string;
}) {
  // Validate that user IDs and workspace_id are provided (should be merged from context by server.ts)
  if (!args.created_by || !args.last_updated_by) {
    throw new Error("User ID is required. Either provide created_by and last_updated_by, or authenticate via session.");
  }
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Either provide workspace_id, or authenticate via session with workspace context.");
  }

  const fact = await Fact.write({
    content: args.content,
    metadata: args.metadata,
    workspace_id: args.workspace_id,
    created_by: args.created_by,
    last_updated_by: args.last_updated_by,
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
