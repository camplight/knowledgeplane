import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact, WorkspaceMember, collections, type WorkspaceRole } from "@knowledgeplane/db";
import { stripEmbeddings } from "./strip-embeddings.js";
import { confirmationResult, gateFactWrite } from "./fact-write-gate.js";
import { recordAudit } from "./audit-log.js";

export const factsWriteTool: Tool = {
  name: "facts_write",
  description:
    "Write a fact to the knowledge base. Secrets are stripped before save. When confirmation is required, call again with confirmed: true. Canonical facts are admin-only.",
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
      confirmed: { type: "boolean", description: "Set true after the person confirms the save" },
      acknowledge_sensitive: { type: "boolean", description: "Set true to save content that matched the workspace blocklist" },
      canonical: { type: "boolean", description: "Mark the fact canonical. Admins only. Search prefers it, and only admins can change it." },
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
  confirmed?: boolean;
  acknowledge_sensitive?: boolean;
  canonical?: boolean;
}) {
  // Validate that user IDs and workspace_id are provided (should be merged from context by server.ts)
  if (!args.created_by || !args.last_updated_by) {
    throw new Error("User ID is required. Either provide created_by and last_updated_by, or authenticate via session.");
  }
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Either provide workspace_id, or authenticate via session with workspace context.");
  }

  const member = await WorkspaceMember.findByWorkspaceAndUser(
    args.workspace_id,
    args.created_by,
  );
  if (!member) {
    throw new Error("You are not a member of this workspace");
  }

  const decision = await gateFactWrite({
    content: args.content,
    role: member.role as WorkspaceRole,
    userId: args.created_by,
    workspaceId: args.workspace_id,
    confirmed: args.confirmed,
    acknowledgeSensitive: args.acknowledge_sensitive,
    canonical: args.canonical,
  });
  if (decision.action === "confirm") {
    return confirmationResult(decision);
  }

  const fact = await Fact.write({
    content: decision.content,
    metadata: args.metadata,
    workspace_id: args.workspace_id,
    created_by: args.created_by,
    last_updated_by: args.last_updated_by,
    canonical: decision.canonical,
  });

  await recordAudit({
    action: "fact.write",
    actor_id: args.created_by,
    workspace_id: args.workspace_id,
    object_id: fact.id,
    tool: "facts_write",
    detail: {
      canonical: decision.canonical,
      redactions: decision.redactions.length,
    },
  });

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
