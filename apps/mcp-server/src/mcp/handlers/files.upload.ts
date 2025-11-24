import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { processFileUpload } from "@knowledgeplane/file-processor";

export const filesUploadTool: Tool = {
  name: "files.upload",
  description:
    "Upload a file and automatically extract facts and relations using AI. The file content is analyzed using OpenAI to identify key information and relationships, which are then stored in the knowledge base with links back to the source file.",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Original filename of the file being uploaded",
      },
      mimeType: {
        type: "string",
        description: "MIME type of the file (e.g., 'text/plain', 'application/json')",
      },
      data: {
        type: "string",
        description: "Base64-encoded file content",
      },
      team_id: {
        type: "string",
        description: "Team ID (optional, inferred from session if authenticated)",
      },
      created_by: {
        type: "string",
        description:
          "User ID of the uploader (optional, inferred from session if authenticated)",
      },
    },
    required: ["filename", "mimeType", "data"],
  },
};

export async function handleFilesUpload(args: {
  filename: string;
  mimeType: string;
  data: string; // Base64 encoded
  team_id?: string;
  created_by?: string;
}) {
  // Validate that user ID and team_id are provided (should be merged from context by server.ts)
  if (!args.created_by) {
    throw new Error(
      "User ID is required. Either provide created_by, or authenticate via session.",
    );
  }
  if (!args.team_id) {
    throw new Error(
      "Team ID is required. Team ID should be automatically inferred from authenticated session context.",
    );
  }

  // Decode base64 data
  const buffer = Buffer.from(args.data, "base64");

  // Process file using shared service
  const result = await processFileUpload({
    buffer,
    filename: args.filename,
    mimeType: args.mimeType,
    teamId: args.team_id,
    uploadedBy: args.created_by,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL,
    uploadsDir: process.env.UPLOADS_DIR,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

