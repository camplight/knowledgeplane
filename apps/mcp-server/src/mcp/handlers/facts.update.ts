import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  Fact,
  WorkspaceMember,
  collections,
  isAdmin,
  isWriter,
  redactSecrets,
  type WorkspaceRole,
} from "@knowledgeplane/db";
import { stripEmbeddings } from "./strip-embeddings.js";
import { recordAudit } from "./audit-log.js";

export const factsUpdateTool: Tool = {
  name: "facts_update",
  description: "Update a fact in the knowledge base. Only provided fields will be updated.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the fact to update" },
      content: { type: "string", description: "The updated content of the fact" },
      metadata: {
        type: "object",
        description: "Updated key-value pairs of metadata",
        additionalProperties: { type: "string" },
      },
      last_updated_by: { type: "string", description: "User ID of the person updating the fact" },
      canonical: { type: "boolean", description: "Set or clear the canonical flag. Admins only." },
    },
    required: ["id", "last_updated_by"],
  },
};

export async function handleFactsUpdate(args: {
  id: string;
  content?: string;
  metadata?: Record<string, string>;
  last_updated_by: string;
  workspace_id?: string;
  canonical?: boolean;
}) {
  // Get the fact first to check its workspace_id
  const existingFact = await Fact.findById(args.id);
  if (!existingFact) {
    throw new Error(`Fact with id ${args.id} not found`);
  }

  // Validate workspace_id (should be set from context)
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (existingFact.workspace_id !== args.workspace_id) {
    throw new Error("Fact does not belong to the specified workspace");
  }
  
  // Validate workspace membership
  const member = await WorkspaceMember.findByWorkspaceAndUser(args.workspace_id, args.last_updated_by);
  if (!member) {
    throw new Error("You are not a member of this workspace");
  }
  const role = member.role as WorkspaceRole;
  if (!isWriter(role)) {
    throw new Error("Viewers can only read this workspace");
  }
  if ((existingFact.canonical || args.canonical !== undefined) && !isAdmin(role)) {
    throw new Error("Only admins can edit a canonical fact");
  }

  const content = args.content === undefined ? undefined : redactSecrets(args.content).content;
  const fact = await Fact.update({
    id: args.id,
    content,
    metadata: args.metadata,
    last_updated_by: args.last_updated_by,
    canonical: args.canonical,
  });
  await recordAudit({
    action: "fact.update",
    actor_id: args.last_updated_by,
    workspace_id: args.workspace_id,
    object_id: fact.id,
    tool: "facts_update",
    detail: { canonical: fact.canonical === true },
  });

  if (args.content) {
    try {
      await collections.worker_triggers.save({
        worker_name: "embeddings-generator",
        status: "pending",
        created_at: new Date().toISOString(),
        metadata: {
          type: "fact",
          id: fact.id,
          workspace_id: args.workspace_id,
        },
      });
    } catch (triggerError: any) {
      console.error("Failed to queue embedding trigger:", triggerError.message);
    }
  }

  const sanitizedFact = stripEmbeddings(fact);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ fact: sanitizedFact }, null, 2),
      },
    ],
  };
}

