export type UserID = string;

export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface Fact {
  id: string;
  content: string;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
  created_by: UserID;
  last_updated_by: UserID;
  knowledge_context: string;
}
