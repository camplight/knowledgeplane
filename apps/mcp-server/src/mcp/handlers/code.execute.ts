import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";
import { VM, createContext } from "node:vm";
import { createAIModelClient } from "@knowledgeplane/aimodel";

export const codeExecuteTool: Tool = {
  name: "code_execute",
  description:
    "Execute JavaScript/TypeScript code in a sandboxed VM environment. The execution context includes: secrets (key-value pairs), facts API (create, bulkCreate, update, delete, query), and console for logging. The code should be a string containing valid JavaScript/TypeScript code. Returns the result of the last expression or the return value.",
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "JavaScript/TypeScript code to execute. Can be a script or a function that returns a value.",
      },
      secrets: {
        type: "object",
        description:
          "Key-value pairs of secrets to make available in the execution context",
        additionalProperties: { type: "string" },
      },
      workspace_id: {
        type: "string",
        description: "Workspace ID for facts operations",
      },
      created_by: {
        type: "string",
        description: "User ID for facts operations (defaults to 'system' if not provided)",
      },
      timeout: {
        type: "number",
        description:
          "Execution timeout in milliseconds (default: 30000, max: 300000)",
      },
    },
    required: ["code", "workspace_id"],
  },
};

export async function handleCodeExecute(args: {
  code: string;
  secrets?: Record<string, string>;
  workspace_id: string;
  created_by?: string;
  timeout?: number;
}) {
  const timeout = Math.min(args.timeout || 30000, 300000); // Max 5 minutes
  const userId = args.created_by || "system";
  const secrets = args.secrets || {};
  const workspaceId = args.workspace_id;

  // Create AI model client for embeddings (needed for fact search)
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
  );
  const provider = client.getProvider();

  // Collect console output
  const consoleOutput: string[] = [];
  const consoleLog = (...args: any[]) => {
    consoleOutput.push(
      args.map((arg) => {
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(" "),
    );
  };

  // Create facts API object for the execution context
  const factsAPI = {
    create: async (content: string, metadata?: Record<string, string>) => {
      const fact = await Fact.write({
        content,
        metadata,
        workspace_id: workspaceId,
        created_by: userId,
        last_updated_by: userId,
      });
      return fact;
    },
    bulkCreate: async (
      facts: Array<{ content: string; metadata?: Record<string, string> }>,
    ) => {
      const factInputs = facts.map((f) => ({
        content: f.content,
        metadata: f.metadata,
        workspace_id: workspaceId,
        created_by: userId,
        last_updated_by: userId,
      }));
      const result = await Fact.bulkWrite(factInputs);
      return result;
    },
    update: async (
      id: string,
      updates: { content?: string; metadata?: Record<string, string> },
    ) => {
      const fact = await Fact.update({
        id,
        content: updates.content,
        metadata: updates.metadata,
        last_updated_by: userId,
      });
      return fact;
    },
    delete: async (id: string) => {
      const fact = await Fact.trash(id, userId);
      return fact;
    },
    query: async (params: {
      query: string;
      k?: number;
      offset?: number;
      include_trashed?: boolean;
    }) => {
      const hits = await Fact.search({
        query: params.query,
        workspace_id: workspaceId,
        k: params.k || 5,
        offset: params.offset || 0,
        include_trashed: params.include_trashed || false,
        use_vector_search: undefined, // Use hybrid search
        embeddingProvider: provider,
      });
      return hits;
    },
  };

  // Create VM context with secrets and facts API
  const vmContext = createContext({
    secrets,
    facts: factsAPI,
    console: {
      log: consoleLog,
      error: consoleLog,
      warn: consoleLog,
      info: consoleLog,
    },
    // Provide fetch for HTTP requests (Node.js 18+)
    fetch: globalThis.fetch,
    // Provide some common utilities
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    // Provide JSON utilities
    JSON,
    // Provide Math utilities
    Math,
    // Provide Date utilities
    Date,
    // Provide Promise (for async/await support)
    Promise,
    // Provide Array, Object, String, Number constructors
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    ReferenceError,
    SyntaxError,
    // Provide Buffer for binary data
    Buffer: globalThis.Buffer,
    // Provide URL and URLSearchParams for URL manipulation
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
  });

  // Wrap code in async function to support top-level await
  const wrappedCode = `
    (async () => {
      ${args.code}
    })()
  `;

  let result: any;
  let error: Error | null = null;

  try {
    // Create VM with timeout
    const vm = new VM({
      context: vmContext,
      timeout,
      displayErrors: true,
    });

    // Execute code - vm.run() is synchronous but can return a Promise
    const vmResult = vm.run(wrappedCode);

    // If the result is a Promise, await it with timeout
    if (vmResult && typeof vmResult.then === "function") {
      result = await Promise.race([
        vmResult,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Execution timeout")), timeout),
        ),
      ]);
    } else {
      result = vmResult;
    }
  } catch (err: any) {
    error = err;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: !error,
            result: result !== undefined ? result : null,
            error: error
              ? {
                  message: error.message,
                  name: error.name,
                  stack: error.stack,
                }
              : null,
            consoleOutput: consoleOutput.length > 0 ? consoleOutput : undefined,
          },
          null,
          2,
        ),
      },
    ],
  };
}

