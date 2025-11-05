import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";

export const knowledgeContextsListTool: Tool = {
  name: "knowledgecontexts.list",
  description: "List all distinct knowledge contexts stored in the database. Trashed facts are excluded by default unless include_trashed is true.",
  inputSchema: {
    type: "object",
    properties: {
      include_trashed: { type: "boolean", description: "If true, includes knowledge contexts from trashed facts (default: false)" },
    },
    required: [],
  },
};

export async function handleKnowledgeContextsList(args: {
  include_trashed?: boolean;
}) {
  const contexts = await Fact.listKnowledgeContexts(
    args.include_trashed || false,
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ contexts }, null, 2),
      },
    ],
  };
}

