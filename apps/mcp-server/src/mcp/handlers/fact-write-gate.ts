import {
  User,
  Workspace,
  WorkspaceMember,
  decideFactWrite,
  type WorkspaceRole,
  type WriteDecision,
} from "@knowledgeplane/db";

export interface FactWriteRequest {
  content: string;
  role: WorkspaceRole;
  userId: string;
  workspaceId: string;
  confirmed?: boolean;
  acknowledgeSensitive?: boolean;
  canonical?: boolean;
}

export async function gateFactWrite(
  request: FactWriteRequest,
): Promise<WriteDecision> {
  const workspace = await Workspace.findById(request.workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }
  const user = await User.findById(request.userId);
  const memberCount = await WorkspaceMember.countByWorkspace(request.workspaceId);
  return decideFactWrite({
    role: request.role,
    confirmWrites: user ? user.confirm_writes : true,
    requireConfirm: workspace.require_confirm,
    confirmed: request.confirmed === true,
    acknowledgeSensitive: request.acknowledgeSensitive === true,
    content: request.content,
    blocklist: workspace.sensitive_patterns,
    canonicalRequested: request.canonical === true,
    workspaceName: workspace.name,
    memberCount,
  });
}

export function confirmationResult(decision: Extract<WriteDecision, { action: "confirm" }>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            confirmation_required: true,
            reason: decision.reason,
            message: decision.message,
            redactions: decision.redactions,
          },
          null,
          2,
        ),
      },
    ],
  };
}
