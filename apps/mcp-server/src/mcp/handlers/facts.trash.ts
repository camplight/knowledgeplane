import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  Fact,
  Workspace,
  WorkspaceMember,
  isAdmin,
  isWriter,
  type WorkspaceRole,
} from "@knowledgeplane/db";
import { stripEmbeddings } from "./strip-embeddings.js";
import { recordAudit } from "./audit-log.js";

export const factsTrashTool: Tool = {
  name: "facts_trash",
  description: "Mark a fact as trashed. Trashed facts are excluded from search results by default.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the fact to trash" },
      last_updated_by: { type: "string", description: "User ID of the person trashing the fact" },
      purge_now: { type: "boolean", description: "Permanently delete now. Admins only." },
    },
    required: ["id", "last_updated_by"],
  },
};

export async function handleFactsTrash(args: {
  id: string;
  last_updated_by: string;
  workspace_id?: string;
  purge_now?: boolean;
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
  if (existingFact.canonical && !isAdmin(role)) {
    throw new Error("Only admins can trash a canonical fact");
  }
  if (args.purge_now && !isAdmin(role)) {
    throw new Error("Only admins can purge a fact immediately");
  }

  if (args.purge_now) {
    await Fact.purgeNow(args.id);
    await recordAudit({
      action: "fact.purge",
      actor_id: args.last_updated_by,
      workspace_id: args.workspace_id,
      object_id: args.id,
      tool: "facts_trash",
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ purged: true, id: args.id }, null, 2),
        },
      ],
    };
  }

  const workspace = await Workspace.findById(args.workspace_id);
  const fact = await Fact.trash(
    args.id,
    args.last_updated_by,
    workspace?.trash_retention_days ?? 30,
  );
  await recordAudit({
    action: "fact.trash",
    actor_id: args.last_updated_by,
    workspace_id: args.workspace_id,
    object_id: fact.id,
    tool: "facts_trash",
    detail: { purge_after: fact.purge_after || null },
  });
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

