import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { File } from "@knowledgeplane/db";

export const filesListTool: Tool = {
  name: "files.list",
  description: "List files with pagination",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of files to return (default: 50)",
      },
      offset: {
        type: "number",
        description: "Offset for pagination (default: 0)",
      },
    },
  },
};

export async function handleFilesList(args: {
  workspace_id?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = args.limit || 50;
  const offset = args.offset || 0;

  const files = await File.list(args.workspace_id, limit, offset); // workspace_id maps to workspaceId

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ files }, null, 2),
      },
    ],
  };
}

