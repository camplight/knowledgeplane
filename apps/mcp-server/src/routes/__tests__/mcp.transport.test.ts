import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

const connectSpies: Array<ReturnType<typeof vi.fn>> = [];

vi.mock("../../mcp/server.js", () => ({
  createMcpServer: vi.fn(() => {
    const connect = vi.fn().mockResolvedValue(undefined);
    connectSpies.push(connect);
    return { connect };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => {
  class StreamableHTTPServerTransport {
    sessionId?: string;
    onclose?: () => void;

    constructor({
      sessionIdGenerator,
      onsessioninitialized,
      onsessionclosed,
    }: {
      sessionIdGenerator?: () => string;
      onsessioninitialized?: (id: string) => void;
      onsessionclosed?: (id: string) => void;
    }) {
      const id = sessionIdGenerator?.() ?? "test-session";
      this.sessionId = id;
      if (onsessioninitialized) {
        onsessioninitialized(id);
      }
      if (onsessionclosed) {
        void onsessionclosed;
      }
    }

    async handleRequest() {
      return;
    }
  }

  return { StreamableHTTPServerTransport };
});

vi.mock("@knowledgeplane/db", () => ({
  requireAuth: vi.fn(() => ({ userId: "user-1" })),
  User: { getOrCreate: vi.fn() },
  WorkspaceMember: { findByUser: vi.fn() },
}));

import mcpRoutes from "../mcp.js";
import { createMcpServer } from "../../mcp/server.js";

describe("MCP transport connections", () => {
  beforeEach(() => {
    connectSpies.length = 0;
    vi.clearAllMocks();
  });

  it("creates a new MCP server per new session", async () => {
    const app = Fastify();
    await app.register(mcpRoutes);

    const first = await app.inject({ method: "GET", url: "/mcp" });
    const second = await app.inject({ method: "GET", url: "/mcp" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(createMcpServer).toHaveBeenCalledTimes(2);
    expect(connectSpies).toHaveLength(2);
    for (const connect of connectSpies) {
      expect(connect).toHaveBeenCalledTimes(1);
    }

    await app.close();
  });
});
