import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { File } from "@knowledgeplane/db";

export const filesUpdateTool: Tool = {
  name: "files.update",
  description:
    "Update a file. Only provided fields will be updated. Metadata and fact_ids can be updated.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the file to update",
      },
      metadata: {
        type: "object",
        description: "Updated metadata (key-value pairs)",
        additionalProperties: true,
      },
      fact_ids: {
        type: "array",
        description: "Updated array of fact IDs extracted from this file",
        items: {
          type: "string",
        },
      },
    },
    required: ["id"],
  },
};

export async function handleFilesUpdate(args: {
  id: string;
  metadata?: Record<string, any>;
  fact_ids?: string[];
}) {
  const file = await File.update({
    id: args.id,
    metadata: args.metadata,
    fact_ids: args.fact_ids,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ file }, null, 2),
      },
    ],
  };
}

