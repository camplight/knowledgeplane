import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { File } from "@knowledgeplane/db";

export const filesGetTool: Tool = {
  name: "files.get",
  description: "Get a file by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the file to retrieve",
      },
    },
    required: ["id"],
  },
};

export async function handleFilesGet(args: { id: string }) {
  const file = await File.findById(args.id);

  if (!file) {
    throw new Error(`File with id ${args.id} not found`);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ file }, null, 2),
      },
    ],
  };
}

