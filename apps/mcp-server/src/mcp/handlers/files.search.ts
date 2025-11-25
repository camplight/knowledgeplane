import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { File } from "@knowledgeplane/db";

export const filesSearchTool: Tool = {
  name: "files.search",
  description:
    "Search files by fact ID. Returns all files that contain the specified fact ID in their fact_ids array.",
  inputSchema: {
    type: "object",
    properties: {
      fact_id: {
        type: "string",
        description: "The fact ID to search for in files",
      },
      team_id: {
        type: "string",
        description: "Team ID for filtering (optional, inferred from session if authenticated)",
      },
    },
    required: ["fact_id"],
  },
};

export async function handleFilesSearch(args: { 
  fact_id: string;
  team_id?: string;
}) {
  let files = await File.findByFactId(args.fact_id);

  // Filter by team_id (should be set from context)
  if (args.team_id) {
    files = files.filter((f) => f.team_id === args.team_id);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ files, total: files.length }, null, 2),
      },
    ],
  };
}

