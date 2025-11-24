import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { User, TeamMember } from "@knowledgeplane/db/next";

export interface SessionUser {
  userId: string;
  email: string;
  username: string;
}

export interface TRPCContext {
  user: SessionUser | null;
  teamId: string | null;
  req: NextRequest;
}

export async function createContext(opts: {
  req: NextRequest;
}): Promise<TRPCContext> {
  const { req } = opts;
  
  let user: SessionUser | null = null;
  let teamId: string | null = null;
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

        // Get team_id from cookie, or fall back to user's first team
        const teamIdFromCookie = cookieStore.get("teamId")?.value;
        if (teamIdFromCookie) {
          // Validate that user is a member of this team
          const member = await TeamMember.findByTeamAndUser(teamIdFromCookie, userId);
          if (member) {
            teamId = teamIdFromCookie;
          }
        }

        // If no valid teamId from cookie, get user's first team
        if (!teamId) {
          const userTeams = await TeamMember.findByUser(userId, 1, 0);
          if (userTeams.length > 0) {
            teamId = userTeams[0].team_id;
          }
          // Note: teamId can still be null if user has no teams
          // This will be handled by individual routes that require a team
        }
      }
    }
  }
  
  return {
    user,
    teamId,
    req,
  };
}

