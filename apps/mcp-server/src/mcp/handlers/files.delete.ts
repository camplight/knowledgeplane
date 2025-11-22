import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { collections } from "@knowledgeplane/db";

export const filesDeleteTool: Tool = {
  name: "files.delete",
  description: "Delete a file by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the file to delete",
      },
    },
    required: ["id"],
  },
};

export async function handleFilesDelete(args: { id: string }) {
  // Extract key from ID (format: "files/_key" or just "_key")
  const key = args.id.includes("/") ? args.id.split("/")[1] : args.id;
  
  try {
    await collections.files.remove(key);
  } catch (error: any) {
    if (error.errorNum === 1202) {
      throw new Error(`File with id ${args.id} not found`);
    }
    throw error;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, id: args.id }, null, 2),
      },
    ],
  };
}

