import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { User, WorkspaceMember } from "@knowledgeplane/db/next";

export interface SessionUser {
  userId: string;
  email: string;
  username: string;
}

export interface TRPCContext {
  user: SessionUser | null;
  workspaceId: string | null;
  req: NextRequest;
}

export async function createContext(opts: {
  req: NextRequest;
}): Promise<TRPCContext> {
  const { req } = opts;
  
  let user: SessionUser | null = null;
  let workspaceId: string | null = null;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  
  if (sessionId) {
    // In a real app, you'd decode/validate the session
    // For now, we'll get user from session storage
    // This will be handled by NextAuth or session management
    const userId = cookieStore.get("userId")?.value;
    if (userId) {
      const userRecord = await User.findById(userId);
      if (userRecord) {
        user = {
          userId: userRecord.id,
          email: userRecord.email,
          username: userRecord.username,
        };

        // Get workspace_id from cookie, or fall back to user's first workspace
        const workspaceIdFromCookie = cookieStore.get("workspaceId")?.value;
        if (workspaceIdFromCookie) {
          // Validate that user is a member of this workspace
          const member = await WorkspaceMember.findByWorkspaceAndUser(workspaceIdFromCookie, userId);
          if (member) {
            workspaceId = workspaceIdFromCookie;
          }
        }

        // If no valid workspaceId from cookie, get user's first workspace
        if (!workspaceId) {
          const userWorkspaces = await WorkspaceMember.findByUser(userId, 1, 0);
          if (userWorkspaces.length > 0) {
            workspaceId = userWorkspaces[0].workspace_id;
          }
          // Note: workspaceId can still be null if user has no workspaces
          // This will be handled by individual routes that require a workspace
        }
      }
    }
  }
  
  return {
    user,
    workspaceId,
    req,
  };
}

