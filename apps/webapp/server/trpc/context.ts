import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { User } from "@knowledgeplane/db";

export interface SessionUser {
  userId: string;
  email: string;
  username: string;
}

export interface TRPCContext {
  user: SessionUser | null;
  req: NextRequest;
}

export async function createContext(opts: {
  req: NextRequest;
}): Promise<TRPCContext> {
  const { req } = opts;
  
  let user: SessionUser | null = null;
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
      }
    }
  }
  
  return {
    user,
    req,
  };
}

