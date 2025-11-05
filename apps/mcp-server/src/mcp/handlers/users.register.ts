import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { User } from "@knowledgeplane/db";

export const usersRegisterTool: Tool = {
  name: "users.register",
  description: "Register a new user or update an existing user's email if the username already exists",
  inputSchema: {
    type: "object",
    properties: {
      username: {
        type: "string",
        description: "Unique username for the user",
      },
      email: {
        type: "string",
        description: "Email address for the user",
      },
    },
    required: ["username", "email"],
  },
};

export async function handleUsersRegister(args: {
  username: string;
  email: string;
}) {
  const user = await User.create({
    username: args.username,
    email: args.email,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ user }, null, 2),
      },
    ],
  };
}

