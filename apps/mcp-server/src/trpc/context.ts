import { FastifyRequest, FastifyReply } from "fastify";
import { User } from "@knowledgeplane/db";

export interface SessionUser {
  userId: string;
  email: string;
  username: string;
}

export interface TRPCContext {
  user: SessionUser | null;
  req: FastifyRequest;
  reply: FastifyReply;
}

export async function createContext(opts: {
  req: FastifyRequest;
  reply: FastifyReply;
}): Promise<TRPCContext> {
  const { req, reply } = opts;
  
  // Try to get user from session cookie
  let user: SessionUser | null = null;
  const session = await (req as any).session;
  
  if (session?.userId) {
    const userRecord = await User.findById(session.userId);
    if (userRecord) {
      user = {
        userId: userRecord.id,
        email: userRecord.email,
        username: userRecord.username,
      };
    }
  }
  
  return {
    user,
    req,
    reply,
  };
}

