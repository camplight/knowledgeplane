import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact, collections } from "@knowledgeplane/db";
import { stripEmbeddingsArray } from "./strip-embeddings.js";

export const factsBulkWriteTool: Tool = {
  name: "facts_bulkwrite",
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
    workspace_id?: string;
    created_by?: string;
    last_updated_by?: string;
  }>;
}) {
  // Validate that facts array is not empty
  if (!args.facts || args.facts.length === 0) {
    throw new Error("At least one fact is required");
  }

  // Validate that user IDs and workspace_id are provided (should be merged from context by server.ts)
  const hasUserIds = args.facts.every(
    (fact) => fact.created_by && fact.last_updated_by,
  );
  const hasWorkspaceIds = args.facts.every((fact) => fact.workspace_id);

  if (!hasUserIds) {
    throw new Error(
      "User ID is required for all facts. Either provide created_by and last_updated_by for each fact, or authenticate via session.",
    );
  }
  if (!hasWorkspaceIds) {
    throw new Error(
      "Workspace ID is required for all facts. Workspace ID should be automatically inferred from authenticated session context.",
    );
  }

  // Prepare fact inputs for bulk write
  const factInputs = args.facts.map((fact) => ({
    content: fact.content,
    metadata: fact.metadata,
    workspace_id: fact.workspace_id!,
    created_by: fact.created_by!,
    last_updated_by: fact.last_updated_by!,
  }));

  const facts = await Fact.bulkWrite(factInputs);

  try {
    const triggers = facts.map((fact) => ({
      worker_name: "embeddings-generator",
      status: "pending",
      created_at: new Date().toISOString(),
      metadata: {
        type: "fact",
        id: fact.id,
        workspace_id: fact.workspace_id,
      },
    }));
    if (triggers.length > 0) {
      await collections.worker_triggers.saveAll(triggers);
    }
  } catch (triggerError: any) {
    console.error("Failed to queue embedding triggers:", triggerError.message);
  }

  const sanitizedFacts = stripEmbeddingsArray(facts);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { facts: sanitizedFacts, count: sanitizedFacts.length },
          null,
          2,
        ),
      },
    ],
  };
}

